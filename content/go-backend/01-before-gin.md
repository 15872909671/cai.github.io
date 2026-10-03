# 01｜请求还没进 Gin，服务器已经做了什么？

有时会遇到一个很别扭的现象：客户端显示连接成功，服务端的业务日志却一行都没有。端口明明通了，请求去了哪里？

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
    if _, err := bufio.NewReader(os.Stdin).ReadString('\n'); err != nil {
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
ss -lntp 'sport = :8080'
ss -ntp '( sport = :8080 or dport = :8080 )'
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
