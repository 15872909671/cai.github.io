# 02｜Read 明明在等，Go 为什么还能处理其他连接？

接着上一篇的实验：客户端建立连接，只发了一半 HTTP 请求头，然后停住。服务端继续读连接，等剩下的字节。

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
grep '^Threads:' /proc/$pid/status
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
