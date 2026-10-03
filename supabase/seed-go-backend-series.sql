-- Adds two public chapters under 后端 / Go 后端原理, and references them in 博客集.
-- Existing posts (including the old Gin document) are preserved. Repeatable; no schema changes.
begin;
do $chapters$
declare owner uuid:='430ef651-e7f9-4979-96e1-67e6bca2814d'; parent text; folder text; groups jsonb; idx integer; refs jsonb;
begin
 if not exists(select 1 from public.blog_profiles where user_id=owner) then raise exception 'Author not found';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select id into parent from public.blog_folders where owner_id=owner and collection='knowledge' and parent_id is null and name='后端';
 if parent is null then parent:='seed-knaios-backend-20261003';insert into public.blog_folders(id,owner_id,collection,name) values(parent,owner,'knowledge','后端');end if;
 select id into folder from public.blog_folders where owner_id=owner and collection='knowledge' and parent_id=parent and name='Go 后端原理';
 if folder is null then folder:='knaios-go-backend-series';insert into public.blog_folders(id,owner_id,collection,name,parent_id) values(folder,owner,'knowledge','Go 后端原理',parent);end if;
 insert into public.blog_posts(id,owner_id,collection,folder_id,title,summary,body,metadata,published) values('go-backend-before-gin',owner,'knowledge',folder,'01｜请求还没进 Gin，服务器已经做了什么？','沿一条 HTTP/1.1 请求追踪监听、握手、Accept、字节流与 ServeHTTP，附三张分层示意和实验步骤。','有时会遇到一个很别扭的现象：客户端显示连接成功，服务端的业务日志却一行都没有。端口明明通了，请求去了哪里？

如果只看 `r.GET("/ping", handler)`，容易把整个过程想成“客户端访问路径，Gin 找到函数”。这句话跳过了最值得弄明白的一段：**Gin 能看到一个请求之前，操作系统和 Go 标准库已经替它做了不少事。**

这一篇跟着一条连接往里走，直到 handler 的第一行代码。先把边界划清：讨论 Linux 上的普通 TCP、明文 HTTP/1.1，不经过反向代理，不讨论 TLS、HTTP/2、HTTP/3 或 TCP Fast Open。Go 源码固定在 1.23.0，Gin 示例固定在 1.11.0；固定版本是为了方便对照，不代表推荐这些版本部署生产服务。

## 1. 请求“到了”，到底到了哪一层？

先看全图，后面逐个拆开。

![请求从 Linux 内核进入 Go，再由 net/http 交给 Gin；虚线标出用户态和内核态边界](https://knaios.github.io/cai.github.io/assets/go-backend/01-request-layers.svg)

左边是操作系统管理的数据，右边是应用程序能直接处理的数据。中间那条线不是装饰：应用不能把内核的接收缓冲区当作自己的 Go 切片来访问。

“到了网卡”“进入 socket 的接收缓冲”“被 HTTP 解析器读到”“进入 Gin 路由”，对应的是不同进度。排查时说“服务端收到了”，必须补一句：你是从抓包、连接状态，还是业务日志判断的？

抓到包只能说明在所选抓包点观察到了对应流量。握手成功能证明的也有限。即使 TCP 连接成立，HTTP 请求也可能还没有发完，更不用说数据库查询或业务逻辑已经开始执行。

## 2. `:8080` 不是一条连接

服务启动后，先得有一个可以接收新连接的入口。常见的 IPv4 TCP 监听过程可以按 `socket → bind → listen` 理解：创建 socket，绑定本地地址，再进入监听状态。

`0.0.0.0:8080` 中的 `0.0.0.0` 表示这个 IPv4 监听入口覆盖本机的 IPv4 地址，不是某个客户端的地址。客户端仍然连接一个具体地址，例如服务器的内网 IP。若只绑定 `127.0.0.1`，远端机器不能通过这个监听入口连接。

端口也不是整个连接的身份。对于这里讨论的 TCP，一台服务器可以同时保持来自不同客户端的许多连接，它们都使用本地 8080 端口，但远端地址或远端端口不同。理解“同一个监听端口服务很多连接”之后，就不会再把“有一个端口”误解成“只有一个通信通道”。

Go 把 Linux 的这些操作封装在 `net` 包里。沿 `net.Listen` 往下读，在固定版本的 `netFD.listenStream` 中仍然能找到 bind、listen 和文件描述符初始化。抽象没有取消内核中的 socket，只是让业务代码不用亲自操作那些系统调用。[源码：sock_posix.go](https://github.com/golang/go/blob/go1.23.0/src/net/sock_posix.go)

这里出现的 fd，是进程访问内核资源的文件描述符。它是一个句柄，不是接收缓冲区本身，更不是一个 goroutine 的编号。

## 3. 握手完成了，为什么还要 `Accept`？

监听 socket 的职责是接收新连接。读写某个客户端的数据，需要另外的已连接 socket。不要把这两种角色揉成一个东西。

![监听 fd 保持监听，Accept 为不同客户端返回已连接 socket 的 fd](https://knaios.github.io/cai.github.io/assets/go-backend/02-listener-accept.svg)

普通 TCP 的握手由内核协议栈处理。内核维护正在建立以及已经建立、等待应用接走的连接状态。应用调用 `Accept`，是从等待被接收的连接中取得一个已连接 socket 的句柄；原来的监听 socket 继续留下来接新连接。[Linux accept(2)](https://man7.org/linux/man-pages/man2/accept.2.html)

所以，“还没有 Accept”不等于“握手还没完成”。在队列有空间等条件满足时，客户端可以先完成连接建立，服务端应用晚一点再接走它。反过来，客户端 connect 成功也不等于业务处理函数已经运行。

这里还有两个常被混称为 backlog 的概念：尚在握手过程中的连接，与已完成握手、等待 Accept 的连接。Linux 的 `listen` 参数 backlog 主要约束后一种队列，并受系统配置限制；SYN cookies 等机制又会影响握手阶段的状态管理。因此不能把它写成“backlog 就是服务器最大并发连接数”。[Linux listen(2)](https://man7.org/linux/man-pages/man2/listen.2.html)

如果 handler 很慢，也不能直接断言 Accept 队列一定堆满。Go 服务器可以继续接连接，工作可能积在已经接收的连接、goroutine、锁或数据库连接池那里。要看堵在哪个环节，而不是看到慢就改 backlog。

## 4. 网络数据怎样进入这个 socket？

对于真正从远端网卡进入的数据，常见接收路径涉及网卡接收队列、DMA、驱动和内核网络栈。驱动与内核通常通过中断、NAPI 轮询等机制协作；这不是“每来一个包，CPU 必须完整响应一次硬中断”那么简单。队列、批处理和硬件卸载都会改变实际执行细节。[Linux NAPI 文档](https://docs.kernel.org/networking/napi.html)

接着，IP/TCP 层处理自己的协议信息，找到对应连接，并维护字节序号、重传和按序交付等状态。等到应用可以读时，它面向的是连接中的字节流，而不是要求应用亲自把每个 IP 包重新拼起来。

因此内核认识的是连接、序号、缓冲和协议状态，不会因为字节内容是 `/ping` 就去查 Gin 的路由树。HTTP 路径是在用户态被解析出来的。

图里的“socket 接收缓冲”也是为解释数据归属作的简化：真实内核里有相应的数据结构和队列，不是每个连接都分配一块大小固定、永不变化的连续数组。理解归属比死记某张图里的矩形形状重要。

本机访问 `127.0.0.1` 则走 loopback 路径，不会真的经过一块外部网卡收包。用本机实验理解连接和 HTTP 很方便，但别用 loopback 抓包证明网卡 DMA 的细节。

## 5. TCP 不知道你的 HTTP 请求在哪里结束

发送端调用一次 `Write`，接收端是否一定对应一次 `Read`？不一定。TCP 提供字节流，不保留这种应用调用边界。[Linux tcp(7)](https://man7.org/linux/man-pages/man7/tcp.7.html)

例如客户端写入：

```http
GET /ping HTTP/1.1
Host: localhost

```

线上使用 CRLF 分隔行。最后那个空行很重要，它结束请求头部分。

![同一条 HTTP 请求可能分两次 Read 才读到，HTTP 解析器负责识别请求边界](https://knaios.github.io/cai.github.io/assets/go-backend/03-stream-http.svg)

操作系统只要有可供读取的字节，就可能让一次读取取得其中一部分。应用缓冲区太小、到达时机不同，都可能影响这次拿到多少。两次请求的字节也可能在一次底层读取中被一起取进用户态缓冲。

所以协议必须自己定义边界。HTTP/1.1 通过请求行、头部结束标记及消息体长度等规则识别消息；TCP 不会替它认出“这是完整的一条业务消息”。

还要区分“请求头解析完成”和“请求体读取完成”。`net/http` 可以先构造 Request 并把请求交给 handler，Body 作为可读取的流继续存在。上传一个很大的文件时，不能假定所有正文早已完整放进某个 Go 对象。调用 Gin 的 JSON 绑定或读取 Body，才可能继续触发实际读取。

这也解释了一类很具体的卡顿：请求行和头部已经到齐，handler 已经进入，但客户端把正文发得很慢。卡在读取 Body，和卡在 Accept，根本不是同一个等待点。

## 6. 从 `Accept` 到 `ServeHTTP`，谁在执行？

打开 Go 1.23.0 的 `net/http/server.go`，先找 `Server.Serve`。它接受连接，然后为连接启动处理过程；关键位置可以看到 `go c.serve(connCtx)`。继续找 `conn.serve`，能看到读取请求和调用 `serverHandler.ServeHTTP` 的逻辑。[固定版本源码](https://github.com/golang/go/blob/go1.23.0/src/net/http/server.go)

把不影响主线的代码拿掉，结构可概括为下面的**说明性伪代码**，不是可以直接替换标准库的实现：

```text
监听循环：
    接受连接
    启动该连接的处理 goroutine

连接处理：
    解析下一条 HTTP/1.x 请求
    调用 Handler.ServeHTTP
    整理并结束本次响应
    如果允许复用连接，继续处理下一条
```

注意这里讨论 HTTP/1.x 的普通服务路径。这个版本的实现是在连接处理 goroutine 中调用当前请求的 handler，并不是每解析一条 HTTP/1.1 请求，就无条件另外开一个业务 goroutine。连接复用时，同一个连接可以先后承载多次请求。

HTTP/2 又有流和多路复用，不能直接套用上面的执行图。这也是“一个请求一个 goroutine”容易误导的地方：它混淆了描述大致并发方式，与解释具体实现。

再看 Gin。`Engine` 实现 `ServeHTTP`，因此可以作为标准库 HTTP 服务器的 Handler。它接到的已经是标准库提供的请求与响应接口，再做自己的 Context 复用、路由匹配和处理链执行。Gin 并不需要重新实现普通 TCP 握手。[Gin 1.11.0 gin.go](https://github.com/gin-gonic/gin/blob/v1.11.0/gin.go)

到这里，才真正走到最熟悉的 `r.GET` 后面的函数。

## 7. 做一个实验：连接成功，却故意不进入业务

下面这个服务先监听端口，再等你在终端按 Enter，最后才开始 Accept 和处理 HTTP。用它分开观察“内核已监听”和“应用开始服务”。

环境：Linux、Go 1.23 或更高。固定依赖 `github.com/gin-gonic/gin@v1.11.0`。这里是局部机制实验，不是生产服务器模板。

```sh
mkdir before-gin
cd before-gin
go mod init example.com/before-gin
go get github.com/gin-gonic/gin@v1.11.0
```

保存为 `main.go`：

```go
package main

import (
    "bufio"
    "log"
    "net"
    "net/http"
    "os"

    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.New()
    r.GET("/ping", func(c *gin.Context) {
        log.Println("现在才进入 handler")
        c.String(http.StatusOK, "pong\n")
    })
    ln, err := net.Listen("tcp4", "127.0.0.1:8080")
    if err != nil { log.Fatal(err) }
    defer ln.Close()

    log.Println("已监听；按 Enter 后开始 Serve")
    if _, err := bufio.NewReader(os.Stdin).ReadString(''\n''); err != nil {
        log.Fatal(err)
    }
    srv := &http.Server{Handler: r}
    log.Fatal(srv.Serve(ln))
}
```

运行 `go run .`，先不要按 Enter。在另一个终端执行：

```sh
curl --http1.1 -v --max-time 60 http://127.0.0.1:8080/ping
```

在本机资源正常、监听队列有余量时，预期 curl 可以报告连接已建立，但暂时收不到 HTTP 响应。切回服务端按 Enter 后，服务才接走连接并处理请求，此时出现业务日志和 pong。

观察过程中可以运行：

```sh
ss -lntp ''sport = :8080''
ss -ntp ''( sport = :8080 or dport = :8080 )''
```

第一条查看监听，第二条查看相关连接。`ss` 对监听 socket 和已建立连接的队列列含义不同，不要看到 Recv-Q 就一律解释成“待处理请求数”。同样，一个空队列也不能证明业务正常：请求可能早已被应用取走，正堵在别处。

如果实验没有得到预期，先确认 curl 没经过代理、没有超时退出、端口没有被其他进程占用。预期是用来检验的，不是把任何输出都硬解释成文章结论。

## 8. 再做一步：只发送半个请求

服务已经按 Enter 开始处理后，运行下面的 Python 3 程序：

```python
import socket

with socket.create_connection(("127.0.0.1", 8080)) as s:
    s.settimeout(60)
    s.sendall(b"GET /ping HTTP/1.1\r\nHost: localhost\r\n")
    input("请求头还差结束空行，观察服务端，然后按 Enter 补齐：")
    s.sendall(b"Connection: close\r\n\r\n")
    while True:
        data = s.recv(4096)
        if not data:
            break
        print(data.decode(errors="replace"), end="")
```

第一次发送后，TCP 连接已经成立，部分请求字节也确实到达，但请求头还没结束。预期此时没有 handler 日志；补齐头部后，才看到业务开始执行。`recv(4096)` 的循环也刻意保留了：不能用一次 recv 必定拿到完整响应作为前提。

若要观察系统边界，可先 `go build -o before-gin .`，然后用 `strace -f -e trace=network,read,write,epoll_ctl,epoll_wait,epoll_pwait ./before-gin` 启动。不同内核、架构和工具版本可能显示不同系统调用变体，先看“监听、接受、读取、等待”四类动作，不要求输出逐行一致。跟踪会扰动时序，不用它测真实性能。

本文没有伪造抓包或运行截图：源码路径已核对，以上实验尚待在 Linux 环境实测。执行后可把你自己的观察结果补到这一节。

## 9. 回头再看“连接成功，却没有日志”

现在可以把问题问得更具体：连接是不是还在等待 Accept？应用是否正在等完整的 HTTP 头部？还是已经进入 handler，只是卡在读取请求体？这些位置的排查方法不同。

下一篇继续追踪其中最容易误解的一步：HTTP 解析器没有足够字节时，会继续读连接。如果 `Read` 迟迟不返回，执行它的线程是不是也只能一直等？

[继续阅读：02｜Read 明明在等，Go 为什么还能处理其他连接？](https://knaios.github.io/cai.github.io/#/post/go-backend-read-netpoll)

### 阅读线索

- 应用到标准库的讲解方式，可参考 luozhiyun 的[一文说透 Go 语言 HTTP 标准库](https://www.cnblogs.com/luozhiyun/p/14954558.html)。
- 数据链路与抓包的学习方法，可参考小林 coding 的[TCP 实战抓包分析](https://www.xiaolincoding.com/network/3_tcp/tcp_tcpdump.html)。
- 具体实现以文中链接的 Go 1.23.0、Gin 1.11.0 源码为准；配图是本文自行绘制的简化模型，没有复制上述作者的图片。

编写说明：本文为 AI 辅助编写与绘图的独立解读，并非上述作者原文。手绘式排版用于说明机制，不表示图片出自人工手绘。
','{"forum_sync": false, "tags": ["Go", "Linux", "网络", "后端"], "series": "Go 后端：从请求到内核", "source_version": "Go 1.23.0 / Gin 1.11.0", "editorial": "AI-assisted original explanation and diagrams; experiments not executed"}'::jsonb,true) on conflict(id) do nothing;
 if not exists(select 1 from public.blog_posts where id='go-backend-before-gin' and owner_id=owner and published) then raise exception 'Post conflict';end if;
 insert into public.blog_posts(id,owner_id,collection,folder_id,title,summary,body,metadata,published) values('go-backend-read-netpoll',owner,'knowledge',folder,'02｜Read 明明在等，Go 为什么还能处理其他连接？','拆解 EAGAIN、epoll、netpoll 与 goroutine 的等待和唤醒，解释并发竞态、边缘触发及连接开销。','接着上一篇的实验：客户端建立连接，只发了一半 HTTP 请求头，然后停住。服务端继续读连接，等剩下的字节。

这时候再来一个正常客户端，它却能很快得到响应。第一个 Read 还没返回，第二个请求是谁处理的？如果有一万个客户端都只连着不发数据，是不是要准备一万个线程陪它们等？

只说“因为 Go 有协程”还差关键的一环。协程也必须在线程上执行：**Go 需要在不能继续读取时，把等待中的 goroutine 与执行它的线程分开，并在将来有机会继续时把它找回来。**

本文仍限定 Linux、Go 1.23.0，以及由标准 `net` 包管理的普通 TCP socket。文件读写、cgo、直接系统调用以及其他平台的实现不能直接照搬这张图。这里追踪的核心是网络读取，不是把所有等待都归入 epoll。

## 1. 先分清三句话

下面三句话听起来相近，实际不是一个意思：

1. 当前 Go 函数还没有返回。
2. 当前 goroutine 不能继续执行后面的代码。
3. 执行它的操作系统线程被内核阻塞。

第一句不必推出第三句。Go 可以保存 goroutine 的执行状态，把它从可运行工作中移开，再让线程去执行别的 goroutine。调用者看起来仍在 `Read` 那一行，但线程不必与这一次等待绑定到底。

为了方便，后文把 goroutine 简称 G，操作系统线程简称 M。P 是运行 Go 代码所需的一组调度资源与执行资格，不是一颗物理 CPU，也不是一个 socket。G/M/P 的完整调度规则值得另写一篇，这里只用到“等待的 G 可以让出执行机会”。

![G1 进入 I/O 等待后，M 可以运行其他 G；G1 就绪后也要重新获得调度](https://knaios.github.io/cai.github.io/assets/go-backend/04-g-and-m.svg)

图中没有表示 G1 必须回到原来的 M。恢复执行时，它可以由其他合适的线程调度。也不要反过来理解成线程永远不会睡：没有工作时，运行时中的线程仍然可能进入系统等待。区别是，不必为每一个空闲连接都独占一条等待线程。

## 2. 操作系统先给 Go 一个“不用死等”的选择

普通阻塞 socket 在暂时没有数据时，可以让读取它的线程进入等待。非阻塞 socket 则提供另一种结果：现在没有可读数据，就报告 `EAGAIN` 或 `EWOULDBLOCK`，不要求调用线程一直等到数据到达。

“非阻塞”也不意味着整个系统调用完全没有成本或绝不会发生任何延迟。这里说的是它不因 socket 当前缺少数据而无限等待。线程照样要进入内核执行必要操作。

可以把几种读取结果放在一起辨认：

| 结果 | 这次读取告诉你什么 |
| --- | --- |
| 读到正数个字节 | 缓冲区里有数据，应用可以处理 |
| 暂无数据，返回 EAGAIN | 现在不行，以后可能可以 |
| 非零长度读取返回 0 | 对普通 TCP 读路径，可能已读到对端正常关闭后的流结束 |
| 其他错误 | 需要区分连接故障、超时、关闭等情况 |

EAGAIN 不是 EOF。“暂时没到货”和“这一方向不会再有货”差别很大。Go 的 `net.Conn.Read` 会处理底层返回值，常见 TCP 流结束通过 `io.EOF` 暴露；连接重置等又可能是其他错误。业务代码还应遵循 Reader 的约定，先处理 `n > 0` 的有效字节，再处理错误。[read(2)](https://man7.org/linux/man-pages/man2/read.2.html)、[Go 读取实现](https://github.com/golang/go/blob/go1.23.0/src/internal/poll/fd_unix.go)

现在我们有办法不把线程锁死在一次读取里了。但如果只是不断重试，又会变成忙轮询：明知没数据，还一遍遍进入内核询问。接下来需要的是通知机制。

## 3. epoll 帮忙等的是什么？

epoll 允许应用注册关注的文件描述符和事件，再集中取得就绪通知。对于网络读取，可读事件表示值得再尝试读取；它不是“一个完整 HTTP 请求已经替你收好”的承诺。[epoll(7)](https://man7.org/linux/man-pages/man7/epoll.7.html)

设想现在有很多连接，其中绝大多数暂时没有数据。应用不必始终在自己的代码里轮流对每个 fd 发起读取检查，而是通过事件机制处理具备进展条件的对象。

这里不能偷换成“epoll 替应用读取网络正文”。epoll 告诉你什么对象出现了什么事件，正文仍然要通过相应读取路径取得。事件通知、字节拷贝、HTTP 解析是三件事。

也不要把 epoll 简化成“任何情况下都是 O(1)，所以无限连接无成本”。注册、返回事件、内核 socket、用户态连接对象和业务处理都要资源。讨论某个内部操作的复杂度，不能代替整台服务的容量分析。

## 4. Go 的 Read 是怎样把这两步串起来的？

从业务代码的 `conn.Read(buf)` 往下，会经过 `net` 对文件描述符的包装，进入 `internal/poll.FD.Read`。在 Go 1.23.0 的代码里可以核对三个关键动作：尝试系统读取，检查 EAGAIN，必要时调用 `waitRead`，醒来后重试。

![非阻塞 read 返回 EAGAIN 后，G 进入等待；epoll 就绪通知使 G 恢复可运行，再重试读取](https://knaios.github.io/cai.github.io/assets/go-backend/05-read-netpoll.svg)

为了只保留因果关系，写成下面的**机制伪代码**：

```text
准备一次读取
循环：
    对非阻塞 fd 尝试读取
    如果拿到了数据：交还调用者
    如果是 EAGAIN 且 fd 可轮询：
        等待可读 / 关闭 / 超时等结果
        如果可以继续，重试读取
    否则：返回对应结果
```

有数据时，读取可以直接完成，不需要先把 goroutine 停放一次。只有确实不能继续时，等待机制才参与。相关代码也会处理读取锁、EINTR、零长度缓冲以及 EOF 等边界；真实实现不止这几行。[FD.Read 源码](https://github.com/golang/go/blob/go1.23.0/src/internal/poll/fd_unix.go)

再沿 `waitRead` 下去，会连接到 runtime 的轮询等待函数。`internal/poll` 不自己造一个完整调度器，它把“这个 fd 的读取需要等一等”交给运行时协调。[fd_poll_runtime.go](https://github.com/golang/go/blob/go1.23.0/src/internal/poll/fd_poll_runtime.go)

这就是 Go 网络编程常见的组合：底层借助非阻塞 I/O 和就绪通知，上层保留容易阅读的同步调用顺序。你写的是 `n, err := conn.Read(buf)`，不用为了等待一批连接把业务代码全部拆成回调。

## 5. runtime 怎样知道该叫醒哪个 goroutine？

只有一个 fd 编号还不够。数据来了以后，得知道谁在等它，以及等的是读还是写。

运行时用 `pollDesc` 等结构连接文件描述符与等待状态，其中有读方向和写方向的状态。在轮询发现事件后，运行时可以找到对应等待者，使其有机会恢复执行。理解这一层，不必一开始就记住每个字段的名字，但一定要记住：**内核报告 fd 事件，Go runtime 管理 G，两者之间需要对应关系。**

“唤醒”也不是让 CPU 立刻跳进那段业务代码。G 首先需要成为可运行状态，再由调度器安排执行。CPU 忙、可运行队列长时，从网络数据到达到 handler 真正继续执行之间，仍可能有等待。

Go 的网络轮询与调度器、系统监控等路径协作，不宜画成“永远只有一个固定专用 goroutine 每隔一段时间询问 epoll”。具体由哪些路径发起轮询和注入可运行任务，需要结合对应版本源码看。[runtime/netpoll.go](https://github.com/golang/go/blob/go1.23.0/src/runtime/netpoll.go)、[runtime/proc.go](https://github.com/golang/go/blob/go1.23.0/src/runtime/proc.go)

这也说明一个实用区别：网络很快，并不保证业务马上运行；业务延迟里可能包含调度等待。抓包看起来正常而响应仍慢时，还需要看应用内部。

## 6. 最容易漏想的竞争：数据恰好在“准备睡觉”时到了

假设读取返回 EAGAIN，G 正准备进入等待。就在这个间隙，网络数据到了，就绪事件也被轮询到了。

如果设计成“只有 G 已经睡着，通知才有效”，这次事件可能被丢掉：通知方看见没人睡就走了，G 随后睡下，反而错过已有数据。现实中的并发实现必须解决这种交错。

![在 G 真正等待前到达的 ready 通知需要被保存；已经等待的 G 则需要被唤醒](https://knaios.github.io/cai.github.io/assets/go-backend/06-ready-before-park.svg)

在固定版本的 `netpollblock` 中，可以看到 ready、wait 等状态之间的原子操作。若发现已有 ready 通知，可以消费它而不真的进入睡眠；若需要停放，则通过 `gopark` 与相应提交步骤协调。通知与入睡形成同步协议，而不是两句互不关联的赋值。[netpollblock 与 netpollunblock](https://github.com/golang/go/blob/go1.23.0/src/runtime/netpoll.go)

图只表达这个竞争的含义，没有声称展示全部 CAS 分支。读源码时值得自己在纸上安排两种顺序：“先通知、后准备等”与“先停放、后通知”，检查它们怎样都能继续往前走。这比背一串函数名更接近理解并发代码。

## 7. 为什么这里还要关心边缘触发？

Linux 版本的 Go 网络轮询注册包含 `EPOLLET`，也就是边缘触发。不能笼统说“Go 的 epoll 默认是水平触发”。[netpoll_epoll.go](https://github.com/golang/go/blob/go1.23.0/src/runtime/netpoll_epoll.go)

边缘触发下，如果 fd 仍有没读完的数据，不能随意假定还会持续收到新通知。这会影响“什么时候可以安心等待”的判断。

但从这里推出“每次 `net.Conn.Read` 都会把 socket 数据全部读空”也不对。调用者只给了一个缓冲区，Read 取得一些字节就可以返回。调用者下一次再 Read，Go 会先尝试系统读取；只有遇到 EAGAIN，才需要等待下一次进展。

例如 socket 里还有 8 KB，业务每次只给 1 KB 缓冲。几次 Read 可以直接陆续取得已有数据，并不是每次都要等一次新网络事件。等现有数据消耗完，再去等待才合理。这个例子说明接口语义，不保证现实每次恰好取得 1 KB。

就绪后再次尝试读取也不代表必定成功：关闭、错误、超时等情况仍然需要处理。因此可靠实现通常围绕“尝试—等待—重试”组织，而不是收到一次通知就断言读一定完成。

## 8. 一万个等待连接，不等于零开销

现在可以回答开头的问题：对于这里的标准网络读取路径，很多 G 可以等待 socket 数据，而不需要同样数量的操作系统线程分别卡在阻塞 read 上。

不过每个连接仍然需要文件描述符、内核连接状态及缓冲，还可能对应 Go 的连接对象、goroutine 栈和协议缓冲。空闲连接多，CPU 未必忙，内存和 fd 却可能先成为限制。

如果这些连接同时开始发大量数据，原本等待的 G 又会变成可运行工作。此时 CPU、解析成本、锁竞争和业务依赖都重新参与竞争。一个服务“能保持很多空闲连接”，不能直接换算成“能同时完成相同数量的重业务请求”。

`GOMAXPROCS` 也不能当作连接数配置：它主要影响 Go 代码可并行执行的调度资源数量，不是限制程序只能创建多少 G，也不是进程的最大线程数。

## 9. 小实验：连接变多时，线程是否一比一增加？

不用一开始就在电脑上建立十万连接。先用 100 条本机连接观察机制。以下服务在每个连接中读取一个字节，最多等两分钟；没有数据时，读取保持未完成。

保存为 `netwait.go`，只需要标准库：

```go
package main

import (
    "log"
    "net"
    "runtime"
    "sync/atomic"
    "time"
)

func main() {
    ln, err := net.Listen("tcp4", "127.0.0.1:9090")
    if err != nil { log.Fatal(err) }
    defer ln.Close()

    var inflight atomic.Int64
    go func() {
        ticker := time.NewTicker(time.Second)
        defer ticker.Stop()
        for range ticker.C {
            log.Printf("goroutines=%d unfinished_reads=%d",
                runtime.NumGoroutine(), inflight.Load())
        }
    }()

    for {
        conn, err := ln.Accept()
        if err != nil { log.Fatal(err) }
        go func(c net.Conn) {
            defer c.Close()
            if err := c.SetReadDeadline(time.Now().Add(2*time.Minute)); err != nil {
                log.Print(err)
                return
            }
            inflight.Add(1)
            defer inflight.Add(-1)
            var buf [1]byte
            // 只观察等待是否结束；真实协议处理要检查 n 和 err。
            _, _ = c.Read(buf[:])
        }(conn)
    }
}
```

Linux 终端中编译后直接运行二进制，方便取得真正服务进程的 PID：

```sh
go build -o netwait netwait.go
./netwait &
pid=$!
grep ''^Threads:'' /proc/$pid/status
ls /proc/$pid/fd | wc -l
```

另外一个终端运行 Python 3：

```python
import socket

connections = []
try:
    for _ in range(100):
        connections.append(socket.create_connection(("127.0.0.1", 9090)))
    input("已连接但未发送数据，观察服务端；两分钟内按 Enter 发送：")
    for conn in connections:
        conn.sendall(b"x")
finally:
    for conn in connections:
        conn.close()
```

暂停在 input 时，重新查看服务的 goroutine 输出、线程数和 fd 数。预期 G 与 fd 会明显增加，而线程数不需要与 100 条连接一比一增加。发送一个字节后，连接处理函数能结束，相关数量会回落。

这里的 `unfinished_reads` 计数表示读操作所在区段尚未结束，**不是 runtime 精确的 parked-G 计数**；它包含正在执行那几行代码的短暂阶段。线程数也受运行时、环境和采样时刻影响，不应该编造“100 条连接一定只有 4 个线程”的标准答案。

如果要更进一步，可以在本地实验程序里加入 `runtime/trace` 采集，查看网络等待与调度事件。别把高频日志的成本当成 netpoll 本身的性能，也别把同一台机器上的客户端进程统计进服务进程。

本文已按固定源码核对机制，当前编写环境没有 Go 工具链，也不是 Linux 实验机，以上代码和观测步骤尚未实跑。这里给出的是可验证的实验设计，不是已经取得的基准测试结果。

## 10. 用这条链路重新理解一个慢请求

`Read` 很久没回来，先问 socket 当前有没有可读字节。没有，可能是在等对端；有，却没有及时继续，要考虑事件、调度和应用状态。G 已经恢复运行之后，还可能卡在自己的锁或下游调用。

把等待位置区分开，比说“Go 协程轻量，所以应该很快”更有帮助。netpoll 解决的是让等待网络事件的 G 不必各自占住线程；它不会让数据库更快，也不会消除业务代码里的锁竞争。

下一篇可以把连接、请求和 goroutine 放在同一张图里，分别看 HTTP/1.1 长连接与 HTTP/2 多路复用。先把这一层弄清，再读 Gin 的路由与中间件就知道它们究竟站在什么地方。

[上一篇：01｜请求还没进 Gin，服务器已经做了什么？](https://knaios.github.io/cai.github.io/#/post/go-backend-before-gin)

### 阅读线索

- Draven 的[网络轮询器章节](https://draven.co/golang/docs/part3-runtime/ch06-concurrency/golang-netpoller/)适合把 I/O 模型与运行时串起来；涉及实现时仍需对照版本。
- [Go 语言原本](https://golang.design/under-the-hood/)可继续阅读调度相关章节。
- 鸟窝[文章归档](https://colobu.com/archives/)里的“百万 Go TCP 连接的思考”系列，可用来比较连接规模、资源占用与吞吐这些不同指标。

编写说明：本文为 AI 辅助编写与绘图的独立解读，未复制参考作者的正文或图。图中省略了与主线无关的实现分支；实验待复现，未生成虚构性能数据。
','{"forum_sync": false, "tags": ["Go", "Linux", "网络", "后端"], "series": "Go 后端：从请求到内核", "source_version": "Go 1.23.0 / Gin 1.11.0", "editorial": "AI-assisted original explanation and diagrams; experiments not executed"}'::jsonb,true) on conflict(id) do nothing;
 if not exists(select 1 from public.blog_posts where id='go-backend-read-netpoll' and owner_id=owner and published) then raise exception 'Post conflict';end if;
 select showcase_collections into groups from public.blog_profiles where user_id=owner for update;
 select (ordinality-1)::int into idx from jsonb_array_elements(groups) with ordinality where value->>'name'='博客集' order by ordinality limit 1;
 refs:='["go-backend-before-gin","go-backend-read-netpoll"]'::jsonb;
 if idx is null then groups:=groups||jsonb_build_array(jsonb_build_object('id','go-backend-blogs','name','博客集','posts',refs));
 else
  select refs||coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into refs from jsonb_array_elements(groups->idx->'posts') with ordinality where value not in ('"go-backend-before-gin"'::jsonb,'"go-backend-read-netpoll"'::jsonb);
  groups:=jsonb_set(groups,array[idx::text,'posts'],refs);
 end if;
 update public.blog_profiles set showcase_collections=groups where user_id=owner;
end $chapters$;
commit;
select id,title,published from public.blog_posts where id in ('go-backend-before-gin','go-backend-read-netpoll');
