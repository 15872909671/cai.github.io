from pathlib import Path
import random, math, html
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/go-backend'; OUT.mkdir(parents=True,exist_ok=True)
PRE=ROOT/'.test-runtime/go-backend'; PRE.mkdir(parents=True,exist_ok=True)
INK='#34404a'; BLUE='#326ea1'; ORANGE='#b66a3d'; GRAY='#65717a'
FONT='C:/Windows/Fonts/simkai.ttf'
if not Path(FONT).exists(): FONT='C:/Windows/Fonts/msyh.ttc'
class Sheet:
 def __init__(self,name,title,subtitle):
  self.name=name;self.r=random.Random(name);self.im=Image.new('RGB',(1120,680),'#fffefa');self.d=ImageDraw.Draw(self.im)
  self.svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="680" viewBox="0 0 1120 680" role="img">',f'<title>{html.escape(title)}</title>','<rect width="1120" height="680" fill="#fffefa"/>']
  self.text(40,25,title,34);self.text(42,78,subtitle,22,GRAY);self.line([(42,115),(520,116)],BLUE)
 def text(self,x,y,s,size=25,color=INK):
  for i,t in enumerate(s.split('\n')):
   yy=y+i*(size+12);self.d.text((x,yy),t,font=ImageFont.truetype(FONT,size),fill=color)
   self.svg.append(f'<text x="{x}" y="{yy+size*.86}" font-family="KaiTi,STKaiti,Microsoft YaHei,sans-serif" font-size="{size}" fill="{color}">{html.escape(t)}</text>')
 def line(self,points,color=INK,width=2,dash=False,arrow=False):
  ps=[]
  for i,(x,y) in enumerate(points):ps.append((x+self.r.uniform(-1.2,1.2),y+self.r.uniform(-1.2,1.2)))
  if dash:
   for a,b in zip(ps,ps[1:]):
    dx=b[0]-a[0];dy=b[1]-a[1];n=max(1,int(math.hypot(dx,dy)/12))
    for k in range(0,n,2):self.d.line([(a[0]+dx*k/n,a[1]+dy*k/n),(a[0]+dx*min(k+1,n)/n,a[1]+dy*min(k+1,n)/n)],fill=color,width=width)
  else:self.d.line(ps,fill=color,width=width)
  coords=' '.join(f'{x:.1f},{y:.1f}' for x,y in ps)
  self.svg.append(f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"'+(' stroke-dasharray="7 7"' if dash else '')+'/>')
  if arrow:
   a,b=ps[-2:];ang=math.atan2(b[1]-a[1],b[0]-a[0]);tip=[(b[0]-13*math.cos(ang-.45),b[1]-13*math.sin(ang-.45)),b,(b[0]-13*math.cos(ang+.45),b[1]-13*math.sin(ang+.45))];self.line(tip,color,width)
 def box(self,x,y,w,h,label,fill='#eef4fa',size=25):
  assert isinstance(fill,str), 'Fill must be a color string'
  pts=[(x,y),(x+w*.5,y-1),(x+w,y+1),(x+w+1,y+h),(x+w*.4,y+h-1),(x-1,y+h),(x,y)]
  self.d.polygon(pts,fill=fill);self.svg.append(f'<polygon points="'+ ' '.join(f'{a},{b}' for a,b in pts)+f'" fill="{fill}"/>');self.line(pts)
  lines=label.split('\n');self.text(x+17,y+(h-len(lines)*(size+12))/2+4,label,size)
 def arrow(self,x,y,xx,yy):self.line([(x,y),((x+xx)/2+2,(y+yy)/2-2),(xx,yy)],BLUE,3,arrow=True)
 def note(self,s):self.text(42,635,s,20,GRAY)
 def save(self):
  self.svg.append('</svg>');(OUT/(self.name+'.svg')).write_text('\n'.join(self.svg),encoding='utf-8');self.im.save(PRE/(self.name+'.png'))

s=Sheet('01-request-layers','请求到了机器，还没有到 Gin','以远端客户端 → Linux → 明文 HTTP/1.1 为例')
s.text(45,155,'机器 / 内核',25,ORANGE);s.text(650,155,'Go 进程 / 用户态',25,BLUE)
s.line([(595,147),(596,590)],GRAY,dash=True)
s.box(55,218,440,72,'网卡 / 驱动：接收网络数据','#f6eee4');s.box(55,330,440,90,'IP / TCP：定位连接、排序数据','#f6eee4',23);s.box(55,465,440,85,'已连接 socket 的接收缓冲','#f6eee4',24)
s.arrow(280,290,280,327);s.arrow(280,420,280,462)
s.box(660,465,410,85,'net.Conn.Read → 用户态字节');s.box(660,330,410,90,'net/http：解析请求行与头部');s.box(660,218,410,72,'Gin：路由 → 处理函数')
s.arrow(500,506,655,506);s.text(514,456,'read',21);s.arrow(867,460,867,424);s.arrow(867,327,867,294)
s.note('边界要分清：内核不按 /users 路由；请求体可以在 handler 中继续读取。');s.save()

s=Sheet('02-listener-accept','监听 socket 与连接 socket，是两种角色','fd 是进程里的句柄；图中数字只是示意')
s.box(55,185,420,90,'监听 fd 3：0.0.0.0:8080','#f6eee4');s.box(55,345,420,95,'已完成握手的连接\n等待应用 Accept','#f6eee4',25);s.arrow(260,280,260,340)
s.box(665,175,395,85,'fd 7：客户端 A 的连接');s.box(665,340,395,85,'fd 8：客户端 B 的连接');s.box(665,505,395,85,'fd 9：客户端 C 的连接')
s.arrow(482,390,653,220);s.arrow(482,390,653,385);s.arrow(482,390,653,545)
s.text(496,290,'Accept',23,BLUE);s.text(60,500,'监听 fd 留着继续接客。\n读 HTTP 数据用的是新 fd。',27)
s.note('Accept 接走连接，不负责代替内核完成普通 TCP 三次握手。');s.save()

s=Sheet('03-stream-http','TCP 给字节流，HTTP 自己找边界','下图两次 Read 只是可能的切分，不等同于两个网络包')
s.box(50,165,1020,75,'GET /ping HTTP/1.1\\r\\nHost: localhost\\r\\n\\r\\n','#f6eee4',27)
s.text(52,265,'应用可能这样读到：',24)
s.box(50,320,320,83,'第 1 次：GET /pi');s.box(420,320,650,83,'第 2 次：ng HTTP/1.1 ... \\r\\n\\r\\n',size=23)
s.arrow(210,410,360,493);s.arrow(755,410,755,490);s.box(300,505,680,78,'缓冲 + HTTP 解析器 → Request 对象',size=26)
s.note('还可能一次读到多个请求的字节；读完头部，也不等于读完请求体。');s.save()

s=Sheet('04-g-and-m','Read 没返回，不等于线程一直陪它等','这里只画一个线程上的一段执行过程；不表示只有一个线程')
s.text(45,160,'线程 M',27,BLUE);s.line([(170,177),(1060,177)],INK,2,arrow=True)
s.box(190,216,230,86,'运行 G1\n调用 Read',size=25);s.box(490,216,250,86,'运行其他 G\n处理另一项工作',size=23);s.box(810,216,260,86,'G1 再次获调度\n重试 Read',size=23)
s.arrow(425,258,483,258);s.arrow(745,258,805,258)
s.box(205,420,305,103,'G1：等待 I/O\n不占着 M 执行业务','#f6eee4',24);s.box(745,420,325,103,'G1：变为可运行\n等待调度，不是立即跑',size=23)
s.arrow(303,305,303,416);s.arrow(518,470,737,470);s.text(550,404,'fd 就绪',24,BLUE);s.arrow(920,416,920,308)
s.note('等待的 G 仍然占用栈、连接等资源；并发不是零成本。');s.save()

s=Sheet('05-read-netpoll','Go 把“等待”藏在了 Read 里面','正常的可轮询 TCP socket；省略锁、错误处理与 deadline 分支')
s.box(40,173,270,80,'1. 非阻塞 read');s.box(425,173,260,80,'2. 返回 EAGAIN','#f6eee4');s.box(805,173,275,80,'3. G 等待 I/O','#f6eee4')
s.arrow(315,213,415,213);s.arrow(690,213,795,213)
s.box(805,405,275,90,'4. epoll 报告\nfd 可读',size=24);s.box(425,405,260,90,'5. G 变为可运行',size=23);s.box(40,405,270,90,'6. 获调度后\n再次 read',size=24)
s.arrow(942,262,942,395);s.arrow(795,449,696,449);s.arrow(415,449,320,449)
s.line([(175,402),(175,326),(46,326),(46,266)],BLUE,2,arrow=True);s.text(330,330,'有数据 → 拷贝到调用者的 buf → 返回',23,BLUE)
s.note('epoll 返回就绪事件，不替应用读取正文；再次 read 仍可能需要继续等待。');s.save()

s=Sheet('06-ready-before-park','“刚准备睡，数据就来了”怎么办？','示意 ready 状态如何避免丢通知，不是完整原子操作时序')
s.text(55,160,'读 goroutine',28,BLUE);s.text(715,160,'轮询 / 就绪通知',28,ORANGE)
s.line([(280,215),(280,564)],GRAY,dash=True);s.line([(885,215),(885,564)],GRAY,dash=True)
s.box(55,225,450,76,'read 返回 EAGAIN');s.box(660,340,410,90,'数据可读\n记录 ready 状态','#f6eee4',25);s.arrow(875,330,875,335)
s.line([(655,390),(545,390),(510,482)],BLUE,3,arrow=True)
s.box(55,453,450,101,'准备等待时检查状态\n发现 ready → 不必睡下',size=26)
s.text(590,516,'若已睡下，则唤醒 G。',24,BLUE)
s.note('关键不是“收到事件就好”，而是通知与入睡之间要有同步协议。');s.save()
print('Generated six SVG figures and PNG proofs')
