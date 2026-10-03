-- Update only the original RaftGo placeholder. No schema or visibility changes.
-- Repeat execution is a no-op; refuses to overwrite a manually rewritten post.
begin;
do $update$
declare p public.blog_posts%rowtype;
begin
 select * into p from public.blog_posts where id='knaios-raftgo' and owner_id='430ef651-e7f9-4979-96e1-67e6bca2814d' for update;
 if not found then raise exception 'RaftGo post not found for the expected author';end if;
 if p.metadata->>'showcase_source_commit'='a45ceb7036503d437c8a4dbe7c7d42745cbfb417' then return;end if;
 if position('仓库目前为空' in p.body)=0 then raise exception 'RaftGo post was edited; review it before replacing the content';end if;
 update public.blog_posts set
 title='RaftGo：Go / Gin 三节点分布式 KV 服务',
 summary='Gin HTTP 接口、三节点 Raft 共识与 KV 状态机，包含 CAS、请求去重、快照恢复和部署验证。',
 body=$article$# RaftGo：Go / Gin 三节点分布式 KV 服务

[GitHub 仓库](https://github.com/KNAIOS/RaftGo) · [架构与运行说明](https://github.com/KNAIOS/RaftGo#readme) · [验证报告](https://github.com/KNAIOS/RaftGo/blob/a45ceb7036503d437c8a4dbe7c7d42745cbfb417/docs/verification.md)

## 这个项目做了什么

RaftGo 把 Gin HTTP 接口、Raft 共识与 KV 状态机接成一个可以运行的存储服务。客户端通过 HTTP 读写数据，三个节点通过 Raft 复制命令；一次写入在多数派确认、Leader 状态机执行后返回结果。

项目使用 **HashiCorp Raft** 提供选举、日志复制与快照调度，并非从零实现 Raft 算法。项目代码负责服务集成、KV 状态机、CAS、请求去重、客户端重试和部署验证。

## 一次请求的路径

```text
客户端 → Gin HTTP API → 校验 / 鉴权 → Leader
                                      │
                                 Raft.Apply
                                      │
                    复制日志 → 三节点中的多数派确认
                                      │
                           KV 状态机按日志顺序执行
                                      │
                                返回 JSON 结果
```

访问 Follower 时，服务返回非 Leader 提示；客户端根据 Leader 信息或轮询节点重试。服务端不会默默代理所有请求。

## 值得看的实现

- **Get / Put / Delete / CAS**：CAS 在状态机里完成比较与更新，避免先读后写之间被并发请求插入。
- **强一致读**：GET 也通过 `Raft.Apply` 进入复制日志。实现路径直观，代价是读取同样承担共识与持久化开销；目前不是 ReadIndex 或租约读。
- **请求去重**：使用 `client_id`、递增 `sequence` 和请求摘要识别重复写入，返回原结果。超时后重试必须保留原请求身份。
- **持久化与恢复**：使用 bbolt 保存 Raft 日志与稳定状态，通过 KV / 会话快照和日志重放恢复状态。
- **三节点部署**：Docker Compose 为节点分配独立数据目录，提供启动、客户端与压测工具。

## 从哪里读代码

| 入口 | 主要内容 |
| --- | --- |
| [internal/server/server.go](https://github.com/KNAIOS/RaftGo/blob/a45ceb7036503d437c8a4dbe7c7d42745cbfb417/internal/server/server.go) | 配置、Raft 生命周期、Gin 路由、鉴权和请求执行 |
| [internal/store/fsm.go](https://github.com/KNAIOS/RaftGo/blob/a45ceb7036503d437c8a4dbe7c7d42745cbfb417/internal/store/fsm.go) | KV 状态机、CAS、去重、快照与恢复 |
| [cmd/kvctl](https://github.com/KNAIOS/RaftGo/tree/a45ceb7036503d437c8a4dbe7c7d42745cbfb417/cmd/kvctl) | 节点轮询和保留请求身份的重试 |
| [scripts/verify.py](https://github.com/KNAIOS/RaftGo/blob/a45ceb7036503d437c8a4dbe7c7d42745cbfb417/scripts/verify.py) | 集群故障与恢复验证脚本 |

## 如何体验

目前通过本地部署体验，暂无在线演示地址。克隆仓库后，按 README 配置 Go / Docker 环境并启动三节点服务，再用 `kvctl` 或 HTTP 请求操作键值。

仓库提供单元测试、Leader 故障、重启、快照、丢失多数派等验证路径；测试结果及运行环境以仓库的验证报告为准。本页是根据提交整理的作品介绍，不代表本站重新执行过这些测试。

## 当前边界

这是固定三节点的学习与工程实践项目。共识依赖多数派；失去多数派时不能继续确认强一致读写。当前没有完整的多用户权限、TLS 与 Raft 传输加密，也没有对所有故障组合做形式化验证。三个容器若在同一台机器上，无法抵御整机故障。

更新依据：[2026-10-03 · a45ceb7](https://github.com/KNAIOS/RaftGo/commit/a45ceb7036503d437c8a4dbe7c7d42745cbfb417)。
$article$,
 metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('github','https://github.com/KNAIOS/RaftGo','showcase_source_commit','a45ceb7036503d437c8a4dbe7c7d42745cbfb417')
 where id=p.id and owner_id=p.owner_id;
end $update$;
commit;
select id,title,summary,published,version from public.blog_posts where id='knaios-raftgo';
