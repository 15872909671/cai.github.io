-- Run once in the project's SQL Editor. This script creates only blog-specific objects.
begin;
create table if not exists public.blog_authors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.blog_authors enable row level security;
revoke all on public.blog_authors from anon, authenticated;
grant select on public.blog_authors to authenticated;
drop policy if exists own_author_membership on public.blog_authors;
create policy own_author_membership on public.blog_authors for select to authenticated using(user_id=(select auth.uid()));

create table if not exists public.blog_folders (
  id text primary key check(length(id) between 1 and 160),
  collection text not null check(collection in ('knowledge','projects','interviews','essays')),
  name text not null check(length(trim(name)) between 1 and 100),
  parent_id text,
  unique(id,collection),
  foreign key(parent_id,collection) references public.blog_folders(id,collection),
  check(parent_id is distinct from id)
);
create unique index if not exists blog_folder_siblings on public.blog_folders(collection,coalesce(parent_id,''),name);
alter table public.blog_folders enable row level security;
revoke all on public.blog_folders from anon, authenticated;
grant select on public.blog_folders to anon, authenticated;
grant insert on public.blog_folders to authenticated;
drop policy if exists read_folders on public.blog_folders;
create policy read_folders on public.blog_folders for select to anon, authenticated using(true);
drop policy if exists author_create_folder on public.blog_folders;
create policy author_create_folder on public.blog_folders for insert to authenticated with check(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));
-- No folder move/delete API: prevents cycles and accidental cascading deletion.

create table if not exists public.blog_posts (
  id text primary key check(length(id) between 1 and 160),
  collection text not null check(collection in ('knowledge','projects','interviews','essays')),
  folder_id text,
  title text not null check(length(trim(title)) between 1 and 200),
  summary text not null default '' check(length(summary)<=500),
  body text not null default '' check(length(body)<=200000),
  metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=100000),
  published boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(folder_id,collection) references public.blog_folders(id,collection)
);
create index if not exists blog_posts_folder on public.blog_posts(folder_id);
create index if not exists blog_posts_public on public.blog_posts(published);
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant insert,update on public.blog_posts to authenticated;
drop policy if exists read_published on public.blog_posts;
create policy read_published on public.blog_posts for select to anon, authenticated using(published);
drop policy if exists author_read on public.blog_posts;
create policy author_read on public.blog_posts for select to authenticated using(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));
drop policy if exists author_insert on public.blog_posts;
create policy author_insert on public.blog_posts for insert to authenticated with check(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));
drop policy if exists author_update on public.blog_posts;
create policy author_update on public.blog_posts for update to authenticated using(exists(select 1 from public.blog_authors where user_id=(select auth.uid()))) with check(exists(select 1 from public.blog_authors where user_id=(select auth.uid())));

create or replace function public.blog_version() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    new.version=old.version+1;
    new.created_at=old.created_at;
    if new.id<>old.id then raise exception 'Post ID cannot be changed'; end if;
  else new.version=1;
  end if;
  new.updated_at=now();return new;
end;
$$;
revoke all on function public.blog_version() from public;
drop trigger if exists blog_version on public.blog_posts;
create trigger blog_version before insert or update on public.blog_posts for each row execute function public.blog_version();
commit;

-- Import existing public posts only; rerunning does not overwrite edited posts.
begin;
insert into public.blog_folders(id,collection,name) values('knowledge/Go','knowledge','Go') on conflict do nothing;
insert into public.blog_folders(id,collection,name) values('knowledge/Linux','knowledge','Linux') on conflict do nothing;
insert into public.blog_folders(id,collection,name) values('knowledge/分布式','knowledge','分布式') on conflict do nothing;
insert into public.blog_folders(id,collection,name) values('knowledge/数据库','knowledge','数据库') on conflict do nothing;
insert into public.blog_posts(id,collection,folder_id,title,summary,body,metadata,published,created_at) values('raft-reading-map','knowledge','knowledge/分布式','读懂 Raft：先画出一条写请求的路径','从 Leader 接收请求到状态机应用，建立理解一致性协议的第一张地图。','## 先确定研究的问题

多个节点保存相同数据时，网络延迟和节点故障会让它们看到不同的事件顺序。Raft 通过复制日志，为状态机提供一致的命令顺序。它不等同于完整数据库，也不自动提供业务权限、索引或备份。

## 沿着写请求往下走

- 客户端把命令交给 Leader；Leader 将它加入自己的日志。
- Leader 向 Follower 复制日志。复制成功和提交成功是不同的状态。
- Leader 按协议的提交规则推进提交位置，再将命令应用到状态机。
- 返回结果时还要考虑客户端重试：同一请求可能到达不止一次。

```
客户端 → Leader 日志 → 日志复制
                       ↓
                  满足提交条件
                       ↓
                  应用到状态机
```

## 阅读时保留三个问题

- 节点重启后，哪些信息必须保留下来？
- Leader 更换后，旧日志如何与新 Leader 对齐？
- 读请求如何避免读到过时的数据？

## 下一步：做可以重复的实验

先做三节点本地实验，观察断开一个节点、停止 Leader 和重启节点时的日志变化。记录预期与实际结果，再回到论文核对协议条件。本文是阅读路线，不代表已经完成这些实验。','{"tags": ["Raft", "一致性", "阅读路线"], "kind": "学习导读", "links": [{"label": "Raft 原始论文与资料", "url": "https://raft.github.io/"}], "related": ["interview/backend-template"]}'::jsonb,true,'2026-09-30T00:00:00Z') on conflict(id) do nothing;
insert into public.blog_posts(id,collection,folder_id,title,summary,body,metadata,published,created_at) values('go-cancellation','knowledge','knowledge/Go','Go 并发帖子：先设计退出，再启动任务','为每个后台任务回答两个问题：谁负责取消，谁负责等待它结束。','## 任务应该有明确的生命周期

启动 Goroutine 很方便，但它的退出需要明确设计。永久等待一个无人发送的 channel、没有截止时间的外部请求，以及无人消费的结果，都可能让后台任务长期存活。

## 取消信号需要被任务主动处理

Context 的取消不会强制终止 Goroutine。任务需要检查取消信号，或调用支持 Context 的操作。阻塞操作本身不支持取消时，只在循环外检查一次信号并不能解决问题。

```
select {
case <-ctx.Done():
    return
case item, ok := <-jobs:
    if !ok {
        return
    }
    // 处理 item；内部阻塞操作也要考虑取消
}
```

## 代码评审时检查什么

- 创建任务的位置是否同时定义了退出条件？
- 发送和接收双方在提前返回时，另一方会不会一直阻塞？
- 需要等待任务结束的地方是否有同步机制？
- channel 的关闭责任是否清楚，是否可能重复关闭？','{"tags": ["Go", "Goroutine", "Context"], "kind": "学习导读", "links": [{"label": "Go context 标准库文档", "url": "https://pkg.go.dev/context"}], "related": ["interview/backend-template"]}'::jsonb,true,'2026-09-30T00:00:00Z') on conflict(id) do nothing;
insert into public.blog_posts(id,collection,folder_id,title,summary,body,metadata,published,created_at) values('linux-troubleshooting','knowledge','knowledge/Linux','Linux 排障：把现象变成一条证据链','从时间窗口、影响范围和资源指标出发，避免看到一个高指标就下结论。','## 先写下现象

记录发生时间、持续时长、受影响接口、错误率、延迟变化和近期发布。区分整体变慢、单个接口变慢和偶发超时，后续采样才有明确目标。

## 从系统到进程逐层缩小范围

- 观察 CPU、内存、磁盘和网络，判断哪个资源与故障同时变化。
- 定位进程与线程，区分正在计算、等待 I/O 和锁竞争。
- 把系统数据与应用日志、调用链和发布记录对齐。

```
# 初步观察；具体选项以本机手册为准
uptime
top
free -h
df -h
# 然后结合应用日志缩小调查范围
```

## 用验证闭合调查

一个指标异常只是一条线索。提出可证伪的假设，做尽量小的验证，再观察故障指标是否随之改善。最后记录根因、修复措施和复发时的识别方法。','{"tags": ["Linux", "排障", "观测"], "kind": "排查清单", "links": [], "related": []}'::jsonb,true,'2026-09-30T00:00:00Z') on conflict(id) do nothing;
insert into public.blog_posts(id,collection,folder_id,title,summary,body,metadata,published,created_at) values('database-study','knowledge','knowledge/数据库','数据库学习清单：从一条查询开始','把执行计划、索引与事务放回具体业务场景，逐项验证理解。','## 查询是怎样执行的

选择一张可以复现的测试表，记录数据规模、字段分布和查询条件。查看执行计划，再比较不同索引下的实际执行情况。不要只用少量测试数据推断生产表现。

## 给实验留下边界

- 记录数据库版本、表结构、索引定义和数据生成方式。
- 区分首次执行和缓存命中后的结果。
- 同时观察读取收益与写入、空间成本。
- 涉及并发事务时，明确隔离级别与操作顺序。

## 把结果整理成文章

用问题、实验条件、观察结果、解释和适用边界五部分组织帖子。暂时没有做过的实验列为待验证，而不是写成结论。','{"tags": ["SQL", "索引", "事务"], "kind": "研究提纲", "links": [], "related": []}'::jsonb,true,'2026-09-30T00:00:00Z') on conflict(id) do nothing;
insert into public.blog_posts(id,collection,folder_id,title,summary,body,metadata,published,created_at) values('backend-template','interviews',null,'后端面试复盘：从问题到改进计划','一份可复用的记录格式。此处展示如何整理提问、回答和后续学习，并非真实面试经历。','## 面试背景

填写公司、城市、业务团队、岗位级别、面试日期和轮次。暂时未知的信息明确写为未知，避免把整个公司的情况等同于单个团队。

## 问题与回答记录

- 示例问题：后台 Goroutine 如何在请求结束后退出？
- 示例问题：Raft 中日志复制和提交有什么区别？
- 分别记录当时的回答、追问，以及没有回答清楚的部分。

## 复盘与行动

为每个薄弱点关联知识文章，并列出可以完成的验证任务。把个人感受与面试中实际发生的事件分开记录。','{"company": "示例企业", "role": "Go 后端", "source": "示例模板", "round": "技术面", "tags": ["Go", "Raft", "复盘"], "demo": true, "links": [], "related": ["article/go-cancellation", "article/raft-reading-map"]}'::jsonb,true,'2026-09-30T00:00:00Z') on conflict(id) do nothing;
insert into public.blog_posts(id,collection,folder_id,title,summary,body,metadata,published,created_at) values('interview-source-template','interviews',null,'外部面经整理：保留来源，也保留上下文','用于整理他人公开面经的结构模板，不代表本人经历，也不包含未经核实的企业评价。','## 来源信息

记录原文链接、发布者、发布时间和适用岗位。转载完整内容前确认授权；一般以链接和自己的摘要为主。

## 提取有价值的信息

- 将岗位、面试轮次与业务背景一起保留。
- 问题按技术标签整理，但不擅自补全原作者的回答。
- 对时间久远或来源不明的信息标记待核实。

## 关联到团队档案

能够确认具体团队时再建立关联；只知道公司时先归档到公司层级。团队调整后，保留记录当时的时间与范围。','{"company": "待归档", "role": "通用后端", "source": "整理模板", "round": "综合面", "tags": ["面经整理", "来源"], "demo": true, "links": [], "related": []}'::jsonb,true,'2026-09-30T00:00:00Z') on conflict(id) do nothing;
commit;