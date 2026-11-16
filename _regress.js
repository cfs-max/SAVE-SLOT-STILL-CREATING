/* 无头逻辑回归：mock Canvas / DOM，验证状态机、分支、点击拦截、响应式、音乐 */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync('princess-dressup.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeCtx() {
  const c = {
    font: '10px x', fillStyle: '', textAlign: '', textBaseline: '',
    globalAlpha: 1, imageSmoothingEnabled: false,
    setTransform(){}, fillRect(){}, save(){}, restore(){}, beginPath(){},
    rect(){}, clip(){}, drawImage(){}, fillText(){},
    measureText(s){ const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const z = m ? +m[1] : 10; return {width: String(s).length * z * 0.62}; },
  };
  return c;
}
function makeEnv(w, h, dpr) {
  const handlers = {};
  const ctx = makeCtx();
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(){ return ctx; },
    addEventListener(k, f){ handlers[k] = f; },
    getBoundingClientRect(){ return {left:0, top:0, width:w, height:h}; },
  };
  class FakeImage {
    constructor(){ this.complete=false; this.naturalWidth=0; this.naturalHeight=0; this.width=100; this.height=100; }
    set src(v){ this._src=v; this.complete=true; this.naturalWidth=100; this.naturalHeight=100; }
    get src(){ return this._src; }
  }
  class FakeAudio {
    constructor(){ this.src=''; this.loop=false; this.volume=1; this.currentTime=0; }
    play(){ return Promise.resolve(); } pause(){} 
  }
  const win = {
    innerWidth:w, innerHeight:h, devicePixelRatio:dpr||1,
    addEventListener(){}, location:{href:'file:///C:/game/princess-dressup.html'},
  };
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Promise, RegExp, Date,
    document:{ getElementById(id){ return id==='game' ? canvas : {addEventListener(){}, click(){}}; } },
    window: win,
    location: win.location,
    Image: FakeImage, Audio: FakeAudio, Blob: function(){}, URL: {createObjectURL(){ return 'blob:mock'; }},
    atob(s){ return Buffer.from(s, 'base64').toString('binary'); },
    requestAnimationFrame(){ /* 不自动循环，手动 draw */ },
    URL2: undefined,
  };
  sandbox.URL = Object.assign(function(a,b){ return new (require('url').URL)(a,b); }, {createObjectURL(){ return 'blob:mock'; }});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, {filename:'game.js'});
  // 真实浏览器里 window === globalThis；mock 里两者分离，需要把接口桥接回沙箱全局
  sandbox.PrincessGame = win.PrincessGame;
  Object.defineProperty(sandbox, 'state', {
    get(){ return win.PrincessGame.state; }, configurable:true
  });
  return {sandbox, canvas, handlers, ctx, win};
}

let pass = 0;
function ok(name, cond, extra){ assert.ok(cond, name + (extra?' | '+extra:'')); console.log('  PASS', name); pass++; }

function clickAt(env, dx, dy){
  const v = env.sandbox.PrincessGame.view;
  env.sandbox.draw();
  const clientX = (dx - v.x) * v.scale, clientY = (dy - v.y) * v.scale;
  env.handlers.pointerdown({clientX, clientY});
}
/* 原地按下+松手（真实浏览器里的一次「单击」） */
function tapAt(env, x, y){
  const v = env.sandbox.PrincessGame.view;
  const ev = (xx,yy)=>({clientX:(xx-v.x)*v.scale, clientY:(yy-v.y)*v.scale, pointerId:1});
  env.sandbox.draw();
  env.handlers.pointerdown(ev(x,y));
  env.handlers.pointerup(ev(x,y));
}
/* 完整的一次拖拽：按下 → 移动 → 松手（设计坐标） */
function dragAt(env, x0, y0, x1, y1){
  const v = env.sandbox.PrincessGame.view;
  const ev = (x,y)=>({clientX:(x-v.x)*v.scale, clientY:(y-v.y)*v.scale, pointerId:1});
  env.sandbox.draw();
  env.handlers.pointerdown(ev(x0,y0));
  env.handlers.pointermove(ev(x1,y1));
  env.handlers.pointerup(ev(x1,y1));
}
function cellCenter(s, id){
  const c = s.gridOf(s.winRect()).cells.find(x=>x.item.id===id);
  return c ? [c.x+c.w/2, c.y+c.h/2] : null;
}
function charCenter(s){
  const r = s.charRect(s.winRect());
  return [r.x+r.w/2, r.y+r.h/2];
}
function outsideChar(s){
  const wr = s.gridOf(s.winRect()).wr;
  return [wr.x+wr.w/2, wr.y+wr.h/2];
}

/* ---------------- 1. 数据层 ---------------- */
{
  const {sandbox} = makeEnv(1280, 720, 1);
  const G = sandbox.PrincessGame;
  const counts = G.WARDROBES.map(x=>x.length);
  ok('5 个衣橱数量 4/7/6/11/18', counts.join(',')==='4,7,6,11,18', counts.join(','));
  ok('物品总数 46', counts.reduce((a,b)=>a+b,0)===46);
  ok('年龄段 5/8/12/15/18', G.AGES.map(a=>a.age).join(',')==='5,8,12,15,18');
  ok('内联资源 160 项（新增项链图层+图标）', Object.keys(G.assets).length===160);
  ok('5 岁蓬蓬裙图标改用蓬蓬裙下身.png', !!G.assets.T_a5_skirt && !G.assets.T_skirt_item);
  ok('初始 TITLE / unlocked=1', G.state.screen==='TITLE' && G.state.unlocked===1);

  // 8 岁图画本：物品栏是合上的本子，弹窗 / 穿戴图层按雏菊分支用打开的版本
  const sk = G.WARDROBES[1].find(x=>x.id==='a8_sketch');
  ok('8 岁图画本物品栏用 8岁图画本像素.png', sk.icon==='T_a8_sketch' && !!G.assets.T_a8_sketch);
  ok('8 岁图画本弹窗显示打开的图画本',
     sandbox.resolveKey(sk,'big')==='T_sketch_no' && sandbox.resolveKey(sk,'layer')==='L_sketch_no');
  G.state.choices.daisy=true;
  ok('带走雏菊后弹窗换有雏菊版本', sandbox.resolveKey(sk,'big')==='T_sketch_yes');
  G.state.choices.daisy=false;

  // 悬浮框按真实文本宽度收缩：只有名称的不该还是 150px 长条
  G.state.tip={item:G.WARDROBES[0].find(x=>x.id==='a5_top'), x:100, y:100};
  const shortBox=sandbox.drawTooltip();
  G.state.tip={item:G.WARDROBES[1].find(x=>x.id==='a8_tshirt'), x:100, y:100};
  const longBox=sandbox.drawTooltip();
  ok('短悬浮框按文本收缩', !!shortBox && shortBox.w<90, shortBox&&shortBox.w);
  ok('长描述仍可用较宽悬浮框', !!longBox && longBox.w>shortBox.w, longBox&&longBox.w);
  G.state.tip=null;

  // 切换年龄段强制恢复播放（即使上一场景手动静音）
  G.state.muted=true; G.state.unlocked=5;
  sandbox.openFolder(1);
  ok('切换年龄段取消静音并恢复播放',
     G.state.muted===false && G.state.screen==='DRESSUP' && G.state.age===1);
  let playedAge=-1;
  const origPlay=sandbox.playMusic;
  sandbox.playMusic=function(){ playedAge=G.state.age; return origPlay(); };
  sandbox.openFolder(2);
  ok('切到 12 岁播的是新年龄段曲目', playedAge===2 && G.state.muted===false, playedAge);
  sandbox.playMusic=origPlay;
}

/* ---------------- 1b. 手持道具定位 / 18 岁层级 / 谢幕 ---------------- */
{
  const env = makeEnv(1280,720,1), s = env.sandbox, G = s.PrincessGame;
  const all = G.WARDROBES.reduce((a,b)=>a.concat(b),[]);
  const find = id => all.find(x=>x.id===id);
  const ids = Object.keys(G.propPlace);
  ok('6 件手持道具有独立定位矩形', ids.length===6);
  for(const id of ids){
    const p = G.propPlace[id], item = find(id);
    ok('道具 '+id+' 定位矩形在窗口内',
       p.x>=0 && p.y>=0 && p.x+p.w<=1 && p.y+p.h<=1 && p.w>0 && p.h>0);
    const key = s.layerKeyOf(item);
    ok('道具 '+id+' 改用紧裁 P_ 资源', key.indexOf('P_')===0 && !!G.assets[key], key);
    ok('道具 '+id+' 归入人物身后图层', s.isBehind(item)===true);
  }
  s.state.choices.daisy=true;
  ok('带走雏菊 → P_sketch_yes', s.layerKeyOf(find('a8_sketch'))==='P_sketch_yes');
  s.state.choices.daisy=false;
  ok('未带雏菊 → P_sketch_no',  s.layerKeyOf(find('a8_sketch'))==='P_sketch_no');
  ok('pick it up 的宝石用抓在手里那张', s.layerKeyOf(find('a8_gem'))==='P_gem_hand');
  s.state.choices.notebook=true;
  ok('画画分支 → P_notebook_sticker', s.layerKeyOf(find('a12_notebook'))==='P_notebook_sticker');
  s.state.choices.notebook=false;
  ok('听课分支 → P_notebook_open',    s.layerKeyOf(find('a12_notebook'))==='P_notebook_open');

  const tote=find('a18_tote'), coat=find('a18_coat'), shoe=find('a18_blueshoes'),
        tights=find('a18_tights'), charm=find('a18_bunny');
  ok('托特包盖在黄色外套上', tote.z>coat.z);
  ok('包挂仍盖在托特包上', charm.z>tote.z);
  ok('蓝色鞋子盖在黄丝袜上', shoe.z>tights.z);

  ok('谢幕滚动放慢 4 倍（1200 帧）', G.endingFrames===1200);
  ok('谢幕用两张独立滚动图', !!G.assets.endRoll1 && !!G.assets.endRoll2 && !G.assets.endSheet);
  s.state.screen='ENDING'; s.state.endingTick=0;
  const e0=s.endingScroll();
  ok('谢幕起点只显示图片1', e0.scroll===0);
  s.state.endingTick=Math.floor(G.endingFrames/2);
  const e1=s.endingScroll();
  ok('谢幕中点是两图交界', Math.abs(e1.scroll-e1.vh/2)<0.01);
  s.state.endingTick=G.endingFrames;
  const e2=s.endingScroll();
  ok('谢幕终点只显示图片2', Math.abs(e2.scroll-e2.vh)<0.01);
  ok('谢幕视口在换装窗口内', e2.win.w>0 && e2.vh>0 && e2.vh<e2.win.h);
  s.draw();
  const v=G.view, r=s.hit(v.x+8+48, v.y+8+20);
  ok('结局仍保留桌面但拦截桌面点击', r && r.fn===null, r&&r.key);
  s.state.endingTick=G.endingFrames; s.draw();
  const w=s.winRect(), vw=w.w-8, vh=w.h-8;
  const bx=w.x+4+vw*0.375+vw*0.245/2, by=w.y+4+vh*0.765+vh*0.07/2;
  const rr=s.hit(bx,by);
  ok('滚到底出现 Free play once again 命中区', rr && rr.key==='end:again', rr&&rr.key);
}

/* ---------------- 2. 标题点击 → 桌面 ---------------- */
{
  const env = makeEnv(1280, 720, 1), G = env.sandbox.PrincessGame;
  const v = G.view;
  clickAt(env, v.x + v.w*0.8, v.y + v.h*0.8);
  ok('标题页任意点击进入 DESKTOP', G.state.screen==='DESKTOP');
  const fc=env.sandbox.folderCell(1);
  clickAt(env, fc.x+fc.w/2, fc.y+fc.h/2);   // 第 2 个文件夹（锁定）
  ok('锁定文件夹点击弹窗提示', G.state.modal && G.state.modal.kind==='info');
  env.sandbox.closeModal();
}

/* ---------------- 2b. 首页：电脑静止、START 浮动且有独立命中区 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, G = s.PrincessGame;
  const v = G.view;
  s.draw();                                  // 首帧 tick=0 → bob=0
  const cx=v.x+v.w/2, cy=v.y+v.h/2, iw=96, ih=84;
  const ix=cx-iw/2, iy=cy-ih/2;
  const sx=ix+iw*(18/64)-2, sy=iy+ih*(11/56)-2;
  const r=s.hit(sx+2, sy+2);
  ok('START 浮动按钮有独立 hover 命中区', r && r.key==='title:start', r&&r.key);
  ok('电脑区域仍有点击区', !!s.hit(ix+iw*0.85, iy+ih*0.85));
  clickAt(env, sx+2, sy+2);
  ok('点击发光 START 进入 DESKTOP', G.state.screen==='DESKTOP');
}

/* ---------------- 3. 解锁链 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, G = s.PrincessGame;
  s.state.screen='DESKTOP';
  for(let i=0;i<5;i++){
    s.openFolder(i);
    ok('进入存档点 '+(i+1)+' → DRESSUP', s.state.screen==='DRESSUP' && s.state.age===i);
    s.saveSlot();
    if(i<4) ok('存档 '+(i+1)+' 后解锁下一个', s.state.unlocked===i+2, 'unlocked='+s.state.unlocked);
  }
  ok('全部完成 → ENDING', s.state.screen==='ENDING');
  ok('完成后进入自由重玩', s.state.freePlay===true && s.state.unlocked===5);
  s.freePlayAgain();
  ok('Free play once again 回桌面且全解锁', s.state.screen==='DESKTOP' && s.folderOpen(4)===true);
}

/* ---------------- 4. 分支与存档 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, G = s.PrincessGame;
  const W = G.WARDROBES;
  const daisy=W[0][0], gem=W[1][0], notebook=W[2][4], remake=W[3][9];
  s.choose(daisy,true);
  ok('5 岁雏菊分支写入', s.state.choices.daisy===true);
  ok('雏菊变体解析正确', s.resolveKey(W[1][5],'big')==='T_sketch_yes');
  s.state.saved[0]=s.snapshot();
  s.state.saved[1]={worn:{},slotOwner:{},choices:{daisy:false,gem:false,notebook:false,remake:false},makeup:[]};
  s.restore(s.state.saved[1]);
  ok('载入旧存档不回滚全局分支', s.state.choices.daisy===true);
  s.choose(gem,true);
  ok('8 岁宝石分支写入', s.state.choices.gem===true);
  ok('18 岁 MacBook 变体解析', s.resolveKey(W[4][10],'big')==='T_macbook_diamond');
  s.choose(notebook,true);
  ok('12 岁笔记本分支写入', s.state.choices.notebook===true);
  ok('笔记本穿戴图层随分支变化', s.layerKeyOf(notebook)==='P_notebook_sticker');
  s.choose(remake,true);
  ok('15 岁 REMAKE 分支写入', s.state.choices.remake===true);
}

/* ---------------- 4.5 二选一弹窗按钮框与左右语义 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, G = s.PrincessGame;
  const V = G.view, UI = G.choiceUI;
  const keys = ['chooseDaisy','chooseGem','chooseClass','chooseRemake'];
  ok('4 张交互弹窗都有独立按钮框配置', keys.every(k=>!!UI[k] && !!UI[k].yes && !!UI[k].no));
  ok('雏菊 / REMAKE 的 yes 在左', UI.chooseDaisy.yes[0]<UI.chooseDaisy.no[0] && UI.chooseRemake.yes[0]<UI.chooseRemake.no[0]);
  ok('宝石 / 上课的 yes 在右', UI.chooseGem.yes[0]>UI.chooseGem.no[0] && UI.chooseClass.yes[0]>UI.chooseClass.no[0]);
  // 合并弹窗后，按钮归一化坐标以「下半区选项素材」的绘制矩形为准
  const base = s.choiceImageRect(s.modalRect());
  for(const k of keys){
    const a=UI[k].yes, b=UI[k].no;
    ok(k+' 两个按钮框不重叠', a[2]<b[0] || b[2]<a[0]);
    const rects=s.choiceRects(base,k);
    const covers=(bb,rc)=> rc.x<=base.x+base.w*bb[0] && rc.y<=base.y+base.h*bb[1]
      && rc.x+rc.w>=base.x+base.w*bb[2] && rc.y+rc.h>=base.y+base.h*bb[3];
    ok(k+' 白框完整框住素材里的按钮', covers(a,rects.yes)&&covers(b,rects.no));
    ok(k+' 白框比按钮外扩 '+G.choicePad, Math.abs(rects.yes.x-(base.x+base.w*a[0]-G.choicePad))<0.01);
  }
  // 端到端：点素材里印着的 yes / no 按钮中心，必须命中对应语义的命中区
  const cases=[
    {k:'chooseDaisy',  age:0, id:'a5_daisy',      field:'daisy',    label:'KEEP IT'},
    {k:'chooseGem',    age:1, id:'a8_gem',        field:'gem',      label:'PICK IT UP'},
    {k:'chooseClass',  age:2, id:'a12_notebook',  field:'notebook', label:'DRAW PICTURES'},
    {k:'chooseRemake', age:3, id:'a15_remake',    field:'remake',   label:'REMAKE T-SHIRT'},
  ];
  const center=(bb)=>{ const r=s.choiceImageRect(s.modalRect());
    return [r.x+r.w*(bb[0]+bb[2])/2, r.y+r.h*(bb[1]+bb[3])/2]; };
  for(const c of cases){
    const item=G.WARDROBES[c.age].find(x=>x.id===c.id);
    s.state.screen='DRESSUP'; s.state.age=c.age; s.state.choices[c.field]=false;
    s.openChoiceModal(item);
    const [cx,cy]=center(UI[c.k].yes);
    s.draw();
    const ry=s.hit(cx,cy);
    ok('点「'+c.label+'」命中 choice:yes', ry && ry.key==='choice:yes', ry&&ry.key);
    clickAt(env,cx,cy);
    ok('点「'+c.label+'」写入 '+c.field+'=true', s.state.choices[c.field]===true);
    s.closeModal();
    // 反向：no 按钮必须命中 choice:no
    s.state.choices[c.field]=true;
    s.openChoiceModal(item);
    const [nx,ny]=center(UI[c.k].no);
    s.draw();
    const rn=s.hit(nx,ny);
    ok(c.k+' 另一按钮命中 choice:no', rn && rn.key==='choice:no', rn&&rn.key);
    clickAt(env,nx,ny);
    ok('点另一按钮写入 '+c.field+'=false', s.state.choices[c.field]===false);
    s.closeModal();
  }
  // 用户报的两个「效果搞反」：确认按钮正确后，分支产物确实生效
  s.state.choices.gem=true;
  ok('pick it up → 身侧放 8岁宝石弹窗.png', s.layerKeyOf(G.WARDROBES[1][0])==='P_gem_hand');
  ok('pick it up → MacBook 物品栏图标钻石版', s.resolveKey(G.WARDROBES[4][10],'icon')==='T_macbook_diamond');
  ok('pick it up → MacBook 弹窗大图钻石版', s.resolveKey(G.WARDROBES[4][10],'big')==='T_macbook_diamond');
  s.state.choices.gem=false;
  ok('stop it → MacBook 光外壳版', s.resolveKey(G.WARDROBES[4][10],'icon')==='T_a18_macbook');
  s.state.choices.notebook=true;
  ok('draw pictures → 身侧贴纸版笔记本', s.layerKeyOf(G.WARDROBES[2][4])==='P_notebook_sticker');
  s.state.choices.notebook=false;
  ok('pay attention → 身侧普通翻开笔记本', s.layerKeyOf(G.WARDROBES[2][4])==='P_notebook_open');
}

/* ---------------- 4.6 12 岁没选画画 → 15 岁不出现 REMAKE T恤 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, G = s.PrincessGame;
  const W = G.WARDROBES, remake = W[3][9], notebook = W[2][4];
  ok('REMAKE T恤声明依赖 12 岁画画分支', remake.requires==='notebook');

  const idsAt = age => { s.state.screen='DRESSUP'; s.state.age=age; return s.currentItems().map(x=>x.id); };
  s.state.choices.notebook=false;
  ok('没选画画 → 15 岁物品栏 10 件、无 REMAKE',
     idsAt(3).length===10 && idsAt(3).indexOf('a15_remake')===-1);
  s.state.choices.notebook=true;
  ok('选了画画 → 15 岁物品栏 11 件、含 REMAKE',
     idsAt(3).length===11 && idsAt(3).indexOf('a15_remake')!==-1);
  ok('条件物品不影响其它年龄段', [0,1,2,4].every(a=>idsAt(a).length===W[a].length));

  // 端到端：格子、点击区、人物穿戴图层都不该再有 REMAKE
  s.state.choices.notebook=false; idsAt(3); s.draw();
  const g=s.gridOf(s.winRect());
  ok('没选画画时衣橱仍为 3×4 且只有 10 个格子', g.cols===3 && g.rows===4 && g.cells.length===10);
  ok('没选画画时格子不含 REMAKE', g.cells.every(c=>c.item.id!=='a15_remake'));
  ok('没选画画时画面中没有 REMAKE 点击区',
     g.cells.every(c=>{ const r=s.hit(c.x+c.w/2,c.y+c.h/2); return !r || r.key!=='item:a15_remake'; }));
  s.state.worn['a15_remake']=true;   // 模拟旧存档的残留穿戴数据
  ok('隐藏物品不会画到人物身上',
     s.currentItems().filter(x=>s.state.worn[x.id]).every(x=>x.id!=='a15_remake'));
  s.onItemClick(remake);
  ok('未解锁时外部点击 REMAKE 也无效', s.state.modal===null && s.state.choices.remake===false);

  // 重进重选：12 岁选画画 → 15 岁穿 REMAKE 存档 → 回 12 岁改选听课 → 15 岁应消失且脱下
  s.resetAll(); s.state.screen='DESKTOP';
  s.openFolder(0); s.saveSlot();
  s.openFolder(1); s.saveSlot();
  s.openFolder(2); s.choose(notebook,true); s.saveSlot();
  s.openFolder(3);
  ok('画画分支下 15 岁可点 REMAKE', s.currentItems().some(x=>x.id==='a15_remake'));
  s.choose(remake,true);
  ok('选 REMAKE 后穿上并占用 top 槽',
     !!s.state.worn['a15_remake'] && s.state.slotOwner.top==='a15_remake');
  s.state.saved[3]=s.snapshot();            // 只存 15 岁快照，不触发谢幕
  s.openFolder(2); s.choose(notebook,false); s.saveSlot();
  ok('回 12 岁改选听课 → REMAKE 分支作废', s.state.choices.remake===false);
  s.openFolder(3);
  ok('重进 15 岁物品栏不再出现 REMAKE', !s.currentItems().some(x=>x.id==='a15_remake'));
  ok('重进 15 岁旧存档里的 REMAKE 已自动脱下',
     !s.state.worn['a15_remake'] && s.state.slotOwner.top!=='a15_remake');
}

/* ---------------- 4.7 物品栏摆放对齐设计稿效果图 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, G = s.PrincessGame;
  const W = G.WARDROBES, L = G.wardrobeLayout;
  const shapes = [[2,2],[2,4],[2,3],[3,4],[4,5]];   // 5/8/12/15/18 岁的网格形状
  const holes  = [0,1,0,1,2];                        // 各年龄段留空格位数（15 岁补项链后少 1 格）
  ok('5 个年龄段都有显式布局表', L.length===5 && L.every(x=>Array.isArray(x)));
  shapes.forEach(([cols,rows],a)=>{
    ok(G.AGES[a].age+' 岁网格 '+cols+'×'+rows,
       L[a].length===rows && L[a].every(r=>r.length===cols));
    const ids=L[a].reduce((acc,r)=>acc.concat(r.filter(Boolean)),[]);
    const own=W[a].map(x=>x.id);
    ok(G.AGES[a].age+' 岁布局无重复且覆盖全部物品',
       new Set(ids).size===ids.length && ids.length===own.length && own.every(id=>ids.indexOf(id)!==-1));
    ok(G.AGES[a].age+' 岁空格数 '+holes[a],
       L[a].reduce((n,r)=>n+r.filter(x=>x===null).length,0)===holes[a]);
  });
  // 关键格位：逐张效果图量出的相对方位
  const spots = [
    [[0,0,'a5_top'],[0,1,'a5_rabbit'],[1,0,'a5_skirt'],[1,1,'a5_daisy']],
    [[0,0,'a8_tshirt'],[0,1,'a8_gem'],[1,0,'a8_warmers'],[1,1,'a8_sketch'],
     [2,0,'a8_denim'],[2,1,'a8_trousers'],[3,0,'a8_sandals'],[3,1,null]],
    [[0,0,'a12_hoodie'],[0,1,'a12_lipstick'],[1,0,'a12_pants'],
     [1,1,'a12_ipad'],[2,0,'a12_trainers'],[2,1,'a12_notebook']],
    [[0,0,'a15_blacktee'],[0,1,'a15_remake'],[0,2,'a15_jacket'],
     [1,1,'a15_headphones'],[2,0,'a15_jeans'],[3,1,'a15_nails']],
    [[0,3,'a18_coat'],[3,1,'a18_tights'],[3,3,'a18_macbook'],
     [4,0,null],[4,2,'a18_blueshoes'],[4,3,null]],
  ];
  spots.forEach((list,a)=>ok(G.AGES[a].age+' 岁关键格位与效果图一致',
    list.every(([r,c,id])=>L[a][r][c]===id)));

  // 渲染层：格子 col/row 与布局一一对应，且能正确命中
  for(let a=0;a<5;a++){
    s.state.screen='DRESSUP'; s.state.age=a; s.state.choices.notebook=true; s.state.modal=null;
    s.state.worn={}; s.state.slotOwner={};   // 避免已穿物品隐藏图标影响命中断言
    s.draw();
    const g=s.gridOf(s.winRect());
    ok(G.AGES[a].age+' 岁格子坐标按布局行列生成',
       g.cells.every(c=>L[a][c.row][c.col]===c.item.id));
    const c0=g.cells[0], hr=s.hit(c0.x+c0.w/2,c0.y+c0.h/2);
    ok(G.AGES[a].age+' 岁首格点击命中正确物品', hr&&hr.key==='item:'+c0.item.id, hr&&hr.key);
  }
  // 条件物品隐藏时保留空格位，其余物品不因数量变化而整体挪位
  s.state.age=3; s.state.choices.notebook=true; s.draw();
  const gYes=s.gridOf(s.winRect());
  const pos=(g,id)=>{ const c=g.cells.find(x=>x.item.id===id); return c?c.col+','+c.row:null; };
  ok('画画分支 REMAKE 位于首行中列', pos(gYes,'a15_remake')==='1,0');
  const rc=gYes.cells.find(x=>x.item.id==='a15_remake');
  s.state.choices.notebook=false; s.draw();
  const gNo=s.gridOf(s.winRect());
  ok('隐藏 REMAKE 后其余物品格位不变',
     ['a15_blacktee','a15_jacket','a15_headphones','a15_jeans','a15_nails']
       .every(id=>pos(gNo,id)===pos(gYes,id)) && pos(gNo,'a15_remake')===null);
  const blocked=s.hit(rc.x+rc.w/2, rc.y+rc.h/2);
  ok('隐藏后原格位没有可点物品', !blocked || blocked.key.indexOf('item:')!==0, blocked&&blocked.key);
}

/* ---------------- 5. 穿戴互斥 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, W = env.sandbox.PrincessGame.WARDROBES;
  s.state.screen='DRESSUP'; s.state.age=1;
  const t=W[1][1], denim=W[1][3], trousers=W[1][4];
  s.wear(t); s.wear(denim);
  ok('穿上 T 恤与牛仔裙', !!s.state.worn[t.id] && !!s.state.worn[denim.id]);
  s.wear(trousers);
  ok('8 岁牛仔短裙与七分裤可叠穿', !!s.state.worn[denim.id] && !!s.state.worn[trousers.id]);
  ok('两件下装分槽互不排斥', denim.slot!==trousers.slot &&
     s.state.slotOwner[denim.slot]===denim.id && s.state.slotOwner[trousers.slot]===trousers.id);
  s.wear(trousers);
  ok('wear() 内部同件切换仍可脱下', !s.state.worn[trousers.id]);
  ok('化妆品槽切换立绘', (()=>{ s.state.age=2; s.wear(W[2][5]); return s.state.makeup[2]===true; })());
}

/* ---------------- 5.1 18 岁耳环来回切换（用户反馈「切几次就不显示」） ---------------- */
{
  const env = makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const W=G.WARDROBES[4];
  const star=W.find(x=>x.id==='a18_starear'), pearl=W.find(x=>x.id==='a18_pearlear');
  s.state.screen='DRESSUP'; s.state.age=4; s.state.worn={}; s.state.slotOwner={};
  ok('两件耳环同属 ears 槽但使用不同图层',
     star.slot==='ears' && pearl.slot==='ears' && s.layerKeyOf(star)!==s.layerKeyOf(pearl));
  const seq=['a18_starear','a18_pearlear','a18_starear','a18_pearlear','a18_starear','a18_pearlear'];
  const itemOf=id=>W.find(x=>x.id===id);
  let allOK=true; const trace=[];
  for(const id of seq){
    s.wear(itemOf(id));
    const wornIds=Object.keys(s.state.worn).filter(k=>s.state.worn[k]);
    const shown=s.currentItems().filter(x=>s.state.worn[x.id]).map(x=>x.id);
    const good=wornIds.length===1 && wornIds[0]===id && shown.length===1
               && shown[0]===id && s.state.slotOwner.ears===id;
    if(!good) allOK=false;
    trace.push(id.replace('a18_','')+'→'+shown.join(','));
  }
  ok('星↔珍珠连续切 6 次每次都只显示当前耳环', allOK, trace.join(' | '));
  // 旧存档/跨存档点造成 worn 与 slotOwner 不一致时，点击必须能戴上而不是被判成脱下
  s.state.worn={}; s.state.slotOwner.ears='a18_starear';
  s.wear(star);
  ok('槽位有残留但没穿时点击能戴上', !!s.state.worn['a18_starear'] && s.state.slotOwner.ears==='a18_starear');
  s.wear(star);
  ok('戴稳后再点同一件仍可脱下', !s.state.worn['a18_starear'] && !s.state.slotOwner.ears);
  ok('珍珠耳饰已还原为原始小尺寸（撤销 1.8 倍放大）',
     G.assets.L_a18_pearlear.length<1500, G.assets.L_a18_pearlear.length);
}

/* ---------------- 5.2 染发 / 耳环图层顺序（用户反馈「戴染发后两件耳环都看不见」） ---------------- */
{
  const env = makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const W=G.WARDROBES[4], at=id=>W.find(x=>x.id===id);
  const dye=at('a18_hairdye'), star=at('a18_starear'), pearl=at('a18_pearlear');
  ok('染发原有 z 高于耳环原有 z（这正是遮挡的根因）',
     dye.z>star.z && dye.z>pearl.z, 'dye='+dye.z+' ear='+star.z);
  const withDye=[dye,pearl];
  ok('规则：染发+珍珠同穿时珍珠盖在染发上',
     s.layerZ(pearl,withDye)>s.layerZ(dye,withDye), 'pearlZ='+s.layerZ(pearl,withDye));
  ok('规则：染发+星形同穿时星形盖在染发上',
     s.layerZ(star,[dye,star])>s.layerZ(dye,[dye,star]));
  ok('规则：没戴染发时耳环保持原有 z 层次',
     s.layerZ(star,[star])===star.z && s.layerZ(pearl,[pearl])===pearl.z);
  ok('规则只作用于 ears 槽，项链/鼻钉等其它配饰不受影响',
     s.layerZ(at('a18_necklace'),withDye)===at('a18_necklace').z &&
     s.layerZ(at('a18_piercings'),withDye)===at('a18_piercings').z);
  // 端到端：hook drawImage，按 data URL 反查资源 key，验证真实 draw() 的绘制先后
  const url2key={}; for(const k in G.assets) url2key[G.assets[k]]=k;
  const order=[];
  env.ctx.drawImage=function(img){ const k=url2key[img&&img._src]; if(k) order.push(k); };
  s.state.screen='DRESSUP'; s.state.age=4; s.state.unlocked=5; s.state.modal=null;
  s.state.worn={a18_hairdye:true,a18_pearlear:true}; s.state.slotOwner={};
  s.draw();
  const iDye=order.indexOf('L_a18_hairdye'), iPearl=order.indexOf('L_a18_pearlear');
  ok('draw() 实际先画染发、后画珍珠耳环（珍珠在上）',
     iDye>=0 && iPearl>=0 && iDye<iPearl, 'dye@'+iDye+' pearl@'+iPearl);
  order.length=0;
  s.state.worn={a18_pearlear:true}; s.draw();
  ok('没戴染发时珍珠耳环仍正常绘制', order.indexOf('L_a18_pearlear')>=0);
  order.length=0;
  s.state.worn={a18_hairdye:true,a18_starear:true}; s.draw();
  const iS=order.indexOf('L_a18_starear'), iD2=order.indexOf('L_a18_hairdye');
  ok('draw() 实际先画染发、后画星形耳环（星形在上）',
     iD2>=0 && iS>iD2, 'dye@'+iD2+' star@'+iS);
  order.length=0;
  s.state.worn={a18_hairdye:true}; s.draw();
  ok('只戴染发时耳环图层不被误画', order.indexOf('L_a18_pearlear')<0 && order.indexOf('L_a18_starear')<0);
}

/* ---------------- 6. 点击防穿透 ---------------- */
{
  const env = makeEnv(1280, 720, 1), s = env.sandbox, G=s.PrincessGame;
  s.state.screen='DESKTOP'; s.state.unlocked=5; s.openFolder(0);
  s.draw();
  const v=G.view;
  const r1=s.hit(v.x+8+48, v.y+8+20);   // 桌面第 1 个文件夹位置
  ok('换装窗口拦截桌面文件夹点击', r1 && r1.key==='view:block' && r1.fn===null, r1&&r1.key);
  s.openItemModal(G.WARDROBES[0][3]);
  s.draw();
  const r2=s.hit(v.x+8+48, v.y+8+20);
  ok('弹窗开启时同样拦截背景', r2 && r2.key==='view:block' && r2.fn===null, r2&&r2.key);
  s.closeModal();
  s.draw();
  const g=s.gridOf(s.winRect()), c=g.cells[0];
  const r3=s.hit(c.x+c.w/2, c.y+c.h/2);
  ok('衣橱格子仍可点击', r3 && r3.key.indexOf('item:')===0, r3&&r3.key);
  ok('5 岁衣橱为 2×2', g.cols===2 && g.rows===2);
  ok('18 岁衣橱为 4×5', (()=>{ s.state.age=4; const q=s.gridOf(s.winRect()); return q.cols===4&&q.rows===5; })());
}

/* ---------------- 7. 响应式 / 像素密度 ---------------- */
{
  for (const [w,h] of [[1920,1080],[1280,720],[1024,768],[800,600],[2560,1080],[640,480],[360,640]]) {
    const env = makeEnv(w,h,1), G=env.sandbox.PrincessGame, v=G.view;
    ok('视口 '+w+'×'+h+' 无 NaN', Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.w)&&Number.isFinite(v.h));
    ok('视口 '+w+'×'+h+' 覆盖画布', v.w*v.scale>=w-0.01 && v.h*v.scale>=h-0.01);
    env.sandbox.draw();
  }
  const env = makeEnv(1280,720,1), s=env.sandbox;
  for(const p of [1,2,3]){ s.setPixelDensity(p); s.draw(); ok('像素密度 '+p+'x 渲染正常', s.PrincessGame.pixelDensity===p); }
  const hi = makeEnv(1280,720,2), s2=hi.sandbox;
  s2.setPixelDensity(2); s2.draw();
  ok('HiDPI 2x 渲染正常', Number.isFinite(s2.PrincessGame.view.k));
}

/* ---------------- 8. 音乐 ---------------- */
{
  const env = makeEnv(1280,720,1), s=env.sandbox;
  const src = s.musicSrc(5);
  ok('音乐源可解析（内联 blob 或外部路径）',
     src==='music/5.mp3' || src.indexOf('blob:')===0, src);
  ok('内联音频解码路径不抛错', typeof s.audioURL==='function' && typeof s.audioURL(8)==='string');
  s.state.screen='DESKTOP'; s.state.unlocked=5; s.openFolder(0);
  ok('进入换装页自动播音乐不抛错', s.state.screen==='DRESSUP');
  s.toggleMusic(); ok('静音切换', s.state.muted===true);
  s.toggleMusic(); ok('取消静音', s.state.muted===false);
}

/* ---------------- 9. 全站英文文案 / 桌面文件夹改版 ---------------- */
{
  const env = makeEnv(1280,720,1), s = env.sandbox, G = s.PrincessGame;
  const drawn = [];
  env.ctx.fillText = function(t){ drawn.push(String(t)); };
  s.draw();                                              // TITLE
  s.state.screen='DESKTOP'; s.draw();
  s.state.startMenu=true; s.draw(); s.state.startMenu=false;
  s.state.unlocked=5;
  for(let a=0;a<5;a++){ s.openFolder(a); s.draw(); }     // 5 个换装窗口标题栏
  s.openItemModal(G.WARDROBES[0][2]); s.draw(); s.closeModal();
  s.lockedModal(1); s.draw(); s.closeModal();
  s.state.screen='ENDING'; s.draw();
  const cjk = drawn.filter(t=>/[\u4e00-\u9fff]/.test(t));
  ok('所有绘制文字均为英文（无中文字符）', cjk.length===0, cjk.slice(0,5).join(' | '));
  ok('XP 任务栏是 START 而不是「开始」', drawn.indexOf('START')>=0 && drawn.indexOf('开始')<0);
  ok('信息弹窗确定按钮是 OK', drawn.indexOf('OK')>=0);
  ok('开始菜单文案全英文', ['RESTART','ABOUT','CLOSE'].every(t=>drawn.indexOf(t)>=0));
  ok('开始菜单已删掉 LOAD MUSIC...', drawn.indexOf('LOAD MUSIC...')<0);
  ok('5 个年龄段标题栏用 AGE x 英文', G.AGES.every(a=>/^AGE \d+$/.test(a.label)));
  ok('5 个文件夹名称均为 AGE x SAVE SLOT',
     G.folderLabels.join('|')==='AGE 5 SAVE SLOT|AGE 8 SAVE SLOT|AGE 12 SAVE SLOT|AGE 15 SAVE SLOT|AGE 18 SAVE SLOT',
     G.folderLabels.join('|'));
  ok('文件夹不再绘制 SLOT x / LOCKED 状态文字',
     !drawn.some(t=>/^SLOT \d/.test(t) || t==='LOCKED' || t==='SLOT 1 OK'));
  ok('锁定提示也是英文', drawn.indexOf('THE AGE 8 SAVE SLOT IS STILL LOCKED.')>=0);
}
{
  // 桌面几何：左侧竖排、名称在图标下方、自适应放大且不越过任务栏
  for(const [w,h] of [[1920,1080],[1280,720],[1024,768],[800,600],[360,640]]){
    const env=makeEnv(w,h,1), s=env.sandbox, G=s.PrincessGame;
    const cells=[0,1,2,3,4].map(i=>s.folderCell(i)), g=cells[0].g;
    ok('视口 '+w+'×'+h+' 五个文件夹左侧竖排',
       cells.every((c,i)=>c.x===cells[0].x && c.w===cells[0].w && (i===0||c.y>cells[i-1].y)));
    ok('视口 '+w+'×'+h+' 名称+图标不超过单格高度',
       g.iconH+g.gap+g.nameH<=g.slotH+0.01);
    ok('视口 '+w+'×'+h+' 第 5 个文件夹不越过任务栏',
       cells[4].y+g.iconH+g.gap+g.nameH<=s.taskbarY()+0.01);
    ok('视口 '+w+'×'+h+' 图标放大且不超过 1.8 倍',
       g.iconH>=20 && g.iconH<=38*1.8+0.01, 'iconH='+g.iconH.toFixed(1));
    s.draw();
  }
}

/* ---------------- 10. 存档按钮 / 人物立绘几何 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const win=s.winRect(), sb=s.saveBtnRect(win), cr=s.charRect(win);
  ok('存档按钮再缩小为 34×22', sb.w===34 && sb.h===22 && G.saveButton.w===34 && G.saveButton.h===22);
  ok('存档按钮水平居中圆台、垂直下移到 y=0.95',
     Math.abs((sb.x+sb.w/2)-(win.x+win.w*0.2995))<0.01 &&
     Math.abs((sb.y+sb.h/2)-(win.y+win.h*0.95))<0.01);
  ok('存档按钮完整落在换装窗口内',
     sb.x>win.x && sb.y>win.y && sb.x+sb.w<win.x+win.w && sb.y+sb.h<win.y+win.h);
  s.state.screen='DESKTOP'; s.state.unlocked=5; s.openFolder(0); s.draw();
  const rs=s.hit(sb.x+sb.w/2, sb.y+sb.h/2);
  ok('存档按钮命中区与绘制矩形一致', !!rs && rs.key==='scene:save', rs&&rs.key);
  ok('人物立绘放大到 0.92 倍窗口高', Math.abs(cr.h-win.h*0.920)<0.01, cr.h.toFixed(1));
  // 五个年龄段人物素材脚底在源图 94.6%~97.7% 处；换装台圆台从 84.1% 起
  [0.946,0.969,0.952,0.977,0.959].forEach((f,a)=>{
    const foot=cr.y+cr.h*f;
    ok('AGE '+G.AGES[a].age+' 脚落在换装台圆台上',
       foot>win.y+win.h*0.841 && foot<win.y+win.h, foot.toFixed(1));
  });
  ok('人物命中矩形与绘制矩形一致',
     s.inChar(cr.x+cr.w/2,cr.y+cr.h/2) && !s.inChar(win.x+win.w*0.9, win.y+win.h*0.5));
}

/* ---------------- 11. 拖拽穿戴 / 拖出脱下 / 非 wear 保持单击 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const all=G.WARDROBES.reduce((a,b)=>a.concat(b),[]), at=id=>all.find(x=>x.id===id);
  s.state.screen='DESKTOP'; s.state.unlocked=5; s.openFolder(0);
  const top=at('a5_top'), [ix,iy]=cellCenter(s,'a5_top');
  const [cx,cy]=charCenter(s), [ox,oy]=outsideChar(s);
  ok('可穿戴物品共 33 件（含新增项链）', all.filter(x=>x.kind==='wear').length===33);
  ok('用户点名的不可穿戴物品全部保持单击',
     ['a5_daisy','a8_gem','a8_sketch','a12_ipad','a12_notebook','a12_lipstick',
      'a15_nails','a15_ipad','a15_cosmetics','a18_makeupbag','a18_macbook','a18_books']
       .every(id=>!s.draggable(at(id)) && at(id).kind!=='wear'));

  tapAt(env, ix,iy);
  ok('原地单击可穿戴物品不再直接穿上', !s.state.worn['a5_top'] && s.state.drag===null);
  dragAt(env, ix,iy, cx,cy);
  ok('从衣橱拖到人物立绘上即穿上',
     !!s.state.worn['a5_top'] && s.state.slotOwner.top==='a5_top' && s.state.drag===null);
  s.draw();
  ok('穿上后衣橱该服饰图标隐藏', s.wardrobeHidden(top)===true);
  const hidden=s.hit(ix,iy);
  ok('穿上后衣橱该格不再有点击区', !hidden || hidden.key.indexOf('item:')!==0, hidden&&hidden.key);
  const url2key={}; for(const k in G.assets) url2key[G.assets[k]]=k;
  const painted=[]; env.ctx.drawImage=function(img){ const k=url2key[img&&img._src]; if(k) painted.push(k); };
  s.draw();
  ok('draw() 不再绘制已隐藏的衣橱图标', painted.indexOf('T_a5_top')<0);
  ok('人物身上仍绘制该服饰图层', painted.indexOf('L_a5_top')>=0);

  dragAt(env, cx,cy, ox,oy);
  ok('从人物身上拖出即脱下',
     !s.state.worn['a5_top'] && !s.state.slotOwner.top && s.state.drag===null);
  s.draw();
  const back=s.hit(ix,iy);
  ok('脱下后衣橱图标与点击区恢复',
     !s.wardrobeHidden(top) && !!back && back.key==='item:a5_top', back&&back.key);

  dragAt(env, ix,iy, ox,oy);
  ok('拖到人物之外松手＝取消穿戴', !s.state.worn['a5_top']);
  dragAt(env, ix,iy, cx,cy);
  ok('再次拖到人物上可重新穿上', !!s.state.worn['a5_top']);
  dragAt(env, cx,cy, cx+2,cy+2);
  ok('从人物起拖但没拖出去＝保持穿着', !!s.state.worn['a5_top']);

  // 同槽互斥：18 岁星形 ↔ 珍珠耳环，隐藏/恢复图标要跟着切换
  s.state.age=4; s.state.worn={}; s.state.slotOwner={}; s.state.screen='DRESSUP';
  s.state.modal=null; s.draw();
  const star=cellCenter(s,'a18_starear'), pearl=cellCenter(s,'a18_pearlear');
  dragAt(env, star[0],star[1], cx,cy);
  ok('拖星形耳环到人物上', !!s.state.worn['a18_starear'] && s.state.slotOwner.ears==='a18_starear');
  s.draw();
  dragAt(env, pearl[0],pearl[1], cx,cy);
  ok('拖珍珠耳环替换同槽星形',
     !!s.state.worn['a18_pearlear'] && !s.state.worn['a18_starear'] && s.state.slotOwner.ears==='a18_pearlear');
  ok('替换后珍珠隐藏、星形图标恢复',
     s.wardrobeHidden(at('a18_pearlear')) && !s.wardrobeHidden(at('a18_starear')));
  s.state.worn={a18_hairdye:true,a18_pearlear:true};
  ok('wornWearAt 取最上层（染发时耳环被提到最上）',
     s.wornWearAt(cx,cy) && s.wornWearAt(cx,cy).id==='a18_pearlear');

  // 非 wear 物品：单击行为完全不变
  s.state.worn={}; s.state.slotOwner={}; s.state.modal=null; s.state.screen='DRESSUP';
  s.state.age=0; s.draw();
  const dz=cellCenter(s,'a5_daisy'); tapAt(env,dz[0],dz[1]);
  ok('雏菊仍是单击打开二选一弹窗', !!s.state.modal && s.state.modal.kind==='choice' && s.state.drag===null);
  s.closeModal();
  s.state.age=1; s.draw();
  const sk=cellCenter(s,'a8_sketch'); tapAt(env,sk[0],sk[1]);
  ok('图画本仍是单击打开物品弹窗', !!s.state.modal && s.state.modal.kind==='item');
  s.closeModal();
  s.state.age=2; s.draw();
  const lp=cellCenter(s,'a12_lipstick'); tapAt(env,lp[0],lp[1]);
  ok('口红仍是单击切换化妆立绘', s.state.makeup[2]===true && s.state.modal===null);
  s.state.age=4; s.draw();
  const bk=cellCenter(s,'a18_books'); tapAt(env,bk[0],bk[1]);
  ok('书堆仍是只显示悬浮说明、不弹窗', s.state.modal===null);
  const mac=cellCenter(s,'a18_macbook'); tapAt(env,mac[0],mac[1]);
  ok('MacBook 仍是单击打开物品弹窗', !!s.state.modal && s.state.modal.kind==='item');
  s.closeModal();

  s.beginDrag('wardrobe',top,ix,iy);
  ok('beginDrag 写入拖拽态', !!s.state.drag && s.state.drag.from==='wardrobe');
  s.openFolder(1);
  ok('切换年龄段清除未完成拖拽', s.state.drag===null);
}

/* ---------------- 12. 拖拽预览与英文操作提示 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const drawn=[]; env.ctx.fillText=function(t){ drawn.push(String(t)); };
  s.state.screen='DESKTOP'; s.state.unlocked=5; s.openFolder(0);
  const item=G.WARDROBES[0].find(x=>x.id==='a5_top');
  s.beginDrag('wardrobe',item,100,100); s.draw();
  ok('从衣橱拖拽时显示英文提示 DROP ON ME TO WEAR', drawn.indexOf('DROP ON ME TO WEAR')>=0);
  drawn.length=0;
  s.beginDrag('char',item,100,100); s.draw();
  ok('从人物拖拽时显示英文提示 DRAG OUT TO REMOVE', drawn.indexOf('DRAG OUT TO REMOVE')>=0);
  s.cancelDrag();
  ok('cancelDrag 清除拖拽态', s.state.drag===null);
  ok('拖拽态可通过 PrincessGame.drag 观察', G.drag===null);
}

/* ---------------- 13. WARDROBE 透明底：只留蓝色线框 + 标题 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const rects=[], texts=[], painted=[];
  env.ctx.fillRect=function(x,y,w,h){ rects.push({x,y,w,h,c:this.fillStyle}); };
  env.ctx.fillText=function(t){ texts.push(String(t)); };
  const url2key={}; for(const k in G.assets) url2key[G.assets[k]]=k;
  env.ctx.drawImage=function(img){ const k=url2key[img&&img._src]; if(k) painted.push(k); };
  const WHITE_PANEL='rgba(255,255,255,0.72)';
  const scan=()=>({
    panel: rects.filter(r=>r.c===WHITE_PANEL).length,
    cellFill: rects.filter(r=>r.c==='rgba(255,255,255,0.55)'||r.c==='rgba(246,195,68,0.42)').length,
    blueBox: rects.filter(r=>r.c==='#7ec8ef').length,
    title: texts.indexOf('WARDROBE')>=0,
  });
  s.state.screen='DESKTOP'; s.state.unlocked=5; s.openFolder(0);
  for(const a of [0,2,4]){
    s.state.age=a; s.state.worn={}; s.state.slotOwner={}; s.state.modal=null;
    rects.length=0; texts.length=0; painted.length=0;
    s.draw();
    const r=scan(), wr=s.gridOf(s.winRect()).wr;
    ok('AGE '+G.AGES[a].age+' 物品栏不再铺白色半透明底', r.panel===0, 'panel='+r.panel);
    ok('AGE '+G.AGES[a].age+' 标题下的白色分隔线已移除',
       !rects.some(q=>q.c==='#ffffff' && q.h===1 && Math.abs(q.x-(wr.x+10))<0.01 && Math.abs(q.w-(wr.w-20))<0.01));
    ok('AGE '+G.AGES[a].age+' 两条蓝色圆角线框仍在', r.blueBox>=8, 'blueRects='+r.blueBox);
    ok('AGE '+G.AGES[a].age+' WARDROBE 标题仍在', r.title===true);
    ok('AGE '+G.AGES[a].age+' 物品图标仍正常绘制', painted.length>0);
  }
  // 悬停 / 使用中：只描边框，不能把刚去掉的底色重新铺回来
  s.state.age=1; s.state.worn={a8_sketch:true};   // 非 wear 的「使用中」道具 → 金色边框
  const [ix,iy]=cellCenter(s,'a8_tshirt');        // hover 一件可穿戴物品 → 白色边框
  const v=G.view;
  env.handlers.pointermove({clientX:(ix-v.x)*v.scale, clientY:(iy-v.y)*v.scale});
  s.draw(); s.draw();                       // 第 1 帧算出 hoverKey，第 2 帧用上它
  rects.length=0; texts.length=0; painted.length=0; s.draw();
  const h=scan();
  ok('悬停 / 使用中的物品不铺半透明色块', h.panel===0 && h.cellFill===0, 'cellFill='+h.cellFill);
  ok('悬停白框与使用中的金框都还在',
     rects.some(r=>r.c==='#ffffff') && rects.some(r=>r.c==='#f6c344'));
  ok('透明底下 8 岁物品图标仍绘制', painted.indexOf('T_a8_tshirt')>=0);
}

/* ---------------- 14. 悬浮框高透明底：底色极淡，文字靠亮描边保读 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const rects=[], texts=[];
  env.ctx.fillRect=function(x,y,w,h){ rects.push({x,y,w,h,c:this.fillStyle}); };
  env.ctx.fillText=function(t){ texts.push({t:String(t), c:this.fillStyle}); };
  const rgb=c=>{
    let m=/^#([0-9a-f]{6})$/i.exec(c);
    if(m) return [0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16));
    m=/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
    return m?[+m[1],+m[2],+m[3]]:[0,0,0];
  };
  const lum=c=>{ const [r,g,b]=rgb(c); return (0.2126*r+0.7152*g+0.0722*b)/255; };
  const alphaOf=c=>{ const m=/rgba\([^)]*?,\s*([\d.]+)\s*\)/.exec(c); return m?+m[1]:1; };
  const HALO=G.tipHalo, BG=G.tipBg;

  ok('悬浮框底色为高透明（alpha <= 0.2）', alphaOf(BG)>0 && alphaOf(BG)<=0.2, 'alpha='+alphaOf(BG));
  ok('文字亮描边为高亮浅色', lum(HALO)>=0.9, 'lum='+lum(HALO).toFixed(2));

  const picks=[
    ['AGE 5 可穿戴', G.WARDROBES[0].find(x=>x.kind==='wear')],
    ['AGE 18 可穿戴', G.WARDROBES[4].find(x=>x.kind==='wear')],
    ['AGE 12 化妆品（非穿戴但有悬浮框）', G.WARDROBES[2].find(x=>x.kind==='makeup')],
    ['AGE 18 书堆（仅悬浮说明）', G.WARDROBES[4].find(x=>x.kind==='tip')],
  ];
  for(const [tag,item] of picks){
    ok(tag+' 测试物品存在', !!item);
    if(!item) continue;
    rects.length=0; texts.length=0;
    G.state.tip={item, x:100, y:100};
    const box=s.drawTooltip();
    ok(tag+' 悬浮框仍绘制', !!box);
    const whole=rects.filter(r=>Math.abs(r.x-box.x)<0.01 && Math.abs(r.y-box.y)<0.01 &&
                               Math.abs(r.w-box.w)<0.01 && Math.abs(r.h-box.h)<0.01);
    ok(tag+' 整框底只有一层高透明填充', whole.length===1 && whole[0].c===BG,
       'layers='+whole.length+' color='+(whole[0]&&whole[0].c));
    ok(tag+' 不再铺不透明奶油白底', !whole.some(r=>r.c==='#fff7ee'||r.c==='#ffffff'||r.c==='#182a4a'));
    ok(tag+' 细边框仍是半透明而非实色', rects.some(r=>r.c==='rgba(24,42,74,0.34)'));
    ok(tag+' 顶部/左侧高光也是半透明', rects.filter(r=>r.c==='rgba(255,255,255,0.58)').length===2);
    ok(tag+' 名称文字仍绘制', texts.some(t=>t.t===item.name));
    const haloCount=texts.filter(t=>t.t===item.name && t.c===HALO).length;
    ok(tag+' 名称带 1px 亮描边（8 邻域）', haloCount>=8, 'halo='+haloCount);
    const main=texts.find(t=>t.t===item.name && lum(t.c)<0.35);
    ok(tag+' 名称主字为深色，与亮描边对比足够', !!main && lum(HALO)-lum(main.c)>0.6,
       main?('diff='+(lum(HALO)-lum(main.c)).toFixed(2)):'missing');
  }
  G.state.tip=null;
  rects.length=0; texts.length=0;
  G.state.tip={item:picks[0][1], x:100, y:100};
  const b1=s.drawTooltip();
  G.state.tip={item:picks[1][1], x:100, y:100};
  const b2=s.drawTooltip();
  ok('高透明底不影响按文本宽度自适应框宽', !!b1 && !!b2 && b1.w>=46 && b2.w>=46);
  G.state.tip=null;
}

/* ---------------- 15. 合并弹窗：一个窗口、名称在标题栏、下区只放描述/选项 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const texts=[], painted=[], fills=[];
  env.ctx.fillText=function(t,x,y){ texts.push({t:String(t),x,y,c:this.fillStyle}); };
  const url2key={}; for(const k in G.assets) url2key[G.assets[k]]=k;
  env.ctx.drawImage=function(img){ const k=url2key[img&&img._src]; if(k) painted.push(k); };
  env.ctx.fillRect=function(x,y,w,h){ fills.push({x,y,w,h,c:this.fillStyle}); };
  const clear=()=>{ texts.length=0; painted.length=0; fills.length=0; };
  const regs=()=>G.regions;
  s.state.screen='DRESSUP'; s.state.unlocked=5; s.state.modal=null; s.state.drag=null;

  // choice：详情弹窗 + 选项弹窗合并成单个窗口
  const daisy=G.WARDROBES[0].find(x=>x.id==='a5_daisy');
  s.state.age=0; s.openChoiceModal(daisy);
  ok('choice 不再带 itemModal 双弹窗标记', !s.state.modal.itemModal);
  clear(); s.draw();
  const r=s.modalRect(), low=s.choiceImageRect(r);
  ok('合并后只注册一个 pop:close', regs().filter(q=>q.key==='pop:close').length===1);
  ok('不再绘制旧的详情弹窗框 popupFrame', painted.indexOf('popupFrame')<0);
  ok('下半区绘制新版选项素材', painted.indexOf('chooseDaisy')>=0);
  ok('上半区仍绘制物品大图', painted.indexOf(s.resolveKey(daisy,'big'))>=0);
  ok('标题栏出现物品名称（大写）', texts.some(q=>q.t===daisy.name.toUpperCase() && q.y<r.y+25));
  ok('图片下方文字区不再重复名称', !texts.some(q=>q.t===daisy.name.toUpperCase() && q.y>=low.y));
  const descLines=s.wrap(daisy.desc,low.w-10,8);
  ok('choice 不额外用代码重复画一遍描述', !texts.some(q=>descLines.indexOf(q.t)>=0));
  ok('选项区在弹窗内且位于图片区下方', low.y>r.y+25 && low.y+low.h<=r.y+r.h+0.01);
  ok('选项素材铺满弹窗内容区宽度', Math.abs(low.w-(r.w-8))<0.01 && Math.abs(low.x-(r.x+4))<0.01);
  ok('选项素材紧贴弹窗底边', Math.abs(low.y+low.h-(r.y+r.h-4))<0.01);
  ok('选项素材保持 900:400 比例', Math.abs(low.w/low.h-900/400)<0.01);
  ok('抹掉素材自带边框（顶/底粉色横条）',
     fills.filter(q=>q.c==='#f990c3' && Math.abs(q.w-low.w)<0.01 && q.h>=8 && q.h<=14).length>=2);
  ok('两个选项命中区仍注册', regs().filter(q=>q.key==='choice:yes'||q.key==='choice:no').length===2);
  ok('新版素材不再注册隐形 choice:x', !regs().some(q=>q.key==='choice:x'));
  s.closeModal();

  // item：只有详情弹窗，名称同样移到标题栏，图片下只放描述
  const it2=G.WARDROBES[0][3];
  s.state.age=0; s.openItemModal(it2);
  clear(); s.draw();
  const r2=s.modalRect(), low2=s.itemDescRect(r2);
  ok('item 弹窗标题栏出现物品名称', texts.some(q=>q.t===it2.name.toUpperCase() && q.y<r2.y+25));
  ok('item 弹窗图片下方不再重复名称', !texts.some(q=>q.t===it2.name.toUpperCase() && q.y>=low2.y));
  ok('item 弹窗不绘制任何选项素材', !painted.some(k=>/^choose/.test(k)));
  ok('item 弹窗下半区只有描述文字', texts.some(q=>q.y>=low2.y && q.y<low2.y+low2.h && q.t.length>2));
  // 只取描述文字：文件夹名称的八邻域描边字也会落在这个 y 区间里，
  // 用「是否出自 item.desc」过滤，避免把背景文字当成描述行。
  const dd=String(it2.desc).toLowerCase();
  const dl=texts.filter(q=>q.y>=low2.y && q.y<low2.y+low2.h && q.t.length>2 &&
                           dd.indexOf(q.t.toLowerCase().replace(/…$/,''))>=0);
  const topGap=dl.length?Math.min.apply(null,dl.map(q=>q.y))-low2.y:0;
  const botGap=dl.length?low2.y+low2.h-(Math.max.apply(null,dl.map(q=>q.y))+9):0;
  ok('纯详情弹窗描述垂直居中', dl.length>0 && Math.abs(topGap-botGap)<12,
     'top='+topGap.toFixed(1)+' bottom='+botGap.toFixed(1)+' lines='+dl.length);
  ok('描述文字全部落在描述框内', dl.length>0 && dl.every(q=>q.y>=low2.y && q.y+9<=low2.y+low2.h+1));
  ok('纯详情描述框压成底部窄条', low2.h<=r2.h*0.25 &&
     Math.abs(low2.y+low2.h-(r2.y+r2.h-4))<0.01, 'h='+low2.h.toFixed(1));
  const imgTop2=r2.y+4+17+2, imgH2=low2.y-imgTop2-2;
  ok('腾出的空间让给物品大图', imgH2>low2.h*2.5, 'imgH='+imgH2.toFixed(1));
  ok('item 弹窗仍绘制物品大图', painted.indexOf(s.resolveKey(it2,'big'))>=0);
  ok('item 弹窗也只有单个 pop:close', regs().filter(q=>q.key==='pop:close').length===1);
  s.closeModal();

  // 所有弹窗共用同一几何，视觉统一
  ok('choice 与 item 弹窗尺寸完全一致', r.w===r2.w && r.h===r2.h && r.x===r2.x && r.y===r2.y);
}

/* ---------------- 16. 任务栏时钟 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const texts=[];
  env.ctx.fillText=function(t,x,y){ texts.push({t:String(t),x,y}); };
  s.state.screen='DESKTOP'; s.state.modal=null; s.state.startMenu=false;
  s.draw();
  const v=G.view, tb=v.y+v.h-20;
  const clock=texts.filter(q=>/^\d{2}:\d{2}$/.test(q.t));
  ok('任务栏只画一个时钟', clock.length===1, 'found='+clock.map(q=>q.t).join(','));
  ok('时钟文字为 13:14', clock.length===1 && clock[0].t==='13:14');
  ok('不再出现旧的 18:24', !texts.some(q=>q.t==='18:24'));
  ok('时钟位于任务栏右下角', clock.length===1 &&
     clock[0].x>v.x+v.w*0.8 && clock[0].y>=tb && clock[0].y<tb+20,
     clock.length?('x='+clock[0].x.toFixed(1)+' y='+clock[0].y.toFixed(1)+' tb='+tb.toFixed(1)):'');
}

/* ---------------- 17. 谢幕只播一次（自由重玩不重播） ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  s.state.screen='DESKTOP';
  ok('初始未播放过谢幕', G.state.endingShown===false);
  for(let i=0;i<5;i++){ s.openFolder(i); s.saveSlot(); }
  ok('首次集齐 5 个存档点 → 播放谢幕',
     G.state.screen==='ENDING' && G.state.endingShown===true);
  ok('首次播放后进入自由重玩', G.state.freePlay===true && G.state.unlocked===5);
  s.freePlayAgain();
  ok('Free play once again 回桌面', G.state.screen==='DESKTOP');

  // 复现用户反馈：完成全部存档后，回前序存档点换装再保存
  s.openFolder(0);
  const it=G.WARDROBES[0].find(x=>x.kind==='wear');
  s.wear(it);
  s.saveSlot();
  ok('前序存档点重存后仍停在桌面', G.state.screen==='DESKTOP',
     'screen='+G.state.screen);
  ok('谢幕标志保持已播放', G.state.endingShown===true);
  ok('重存确实更新了存档快照',
     !!G.state.saved[0] && G.state.saved[0].worn[it.id]===true);
  ok('重存后仍全解锁可自由重玩', G.state.freePlay===true && s.folderOpen(4)===true);
  ok('重存走普通保存动画而非结局分支', G.state.saveAnim===24,
     'saveAnim='+G.state.saveAnim);

  s.openFolder(2); s.saveSlot();
  ok('另一个前序存档点重存同样不重播', G.state.screen==='DESKTOP');
  s.openFolder(4); s.saveSlot();
  ok('末个存档点重存同样不重播', G.state.screen==='DESKTOP');

  // RESTART 后应该能完整重新体验（谢幕可再次触发）
  s.resetAll();
  ok('RESTART 重置谢幕标志', G.state.endingShown===false);
  for(let i=0;i<5;i++){ s.openFolder(i); s.saveSlot(); }
  ok('重新开始后仍能再次播放谢幕',
     G.state.screen==='ENDING' && G.state.endingShown===true);
}


/* ---------------- 18. 本轮 14 条需求 ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const all=G.WARDROBES.reduce((a,b)=>a.concat(b),[]), at=id=>all.find(x=>x.id===id);
  const texts=[], fills=[], painted=[];
  env.ctx.fillText=function(t,x,y){ texts.push({t:String(t),x,y,c:this.fillStyle,a:this.textAlign}); };
  env.ctx.fillRect=function(x,y,w,h){ fills.push({x,y,w,h,c:this.fillStyle}); };
  const url2key={}; for(const k in G.assets) url2key[G.assets[k]]=k;
  env.ctx.drawImage=function(img){ const k=url2key[img&&img._src]; if(k) painted.push(k); };
  const clear=()=>{texts.length=0;fills.length=0;painted.length=0;};

  /* 1. 首页提示常显，不再闪烁 */
  G.state.screen='TITLE'; G.state.startMenu=false; G.state.modal=null;
  let always=true;
  for(let i=0;i<4;i++){ clear(); s.draw(); if(!texts.some(q=>q.t==='CLICK TO START')) always=false; }
  ok('首页 CLICK TO START 每帧常显不闪烁', always);

  /* 2 / 10. ABOUT 长文案 + 开始菜单删 MUSIC 项 */
  ok('ABOUT 换成长英文文案 + Cindy Shan 署名', G.about.length===2 &&
     G.about[0].indexOf('women’s personal growth')>=0 &&
     G.about[0].indexOf('Still Creating. I am never a finished version')>=0 &&
     G.about[1]==='Cindy Shan');
  ok('ABOUT 不再用旧占位文案', G.about.join('|').indexOf('5 SAVE SLOTS')<0);
  s.infoModal('ABOUT',G.about,{wide:true});
  clear(); s.draw();
  const abLines=texts.filter(q=>q.t.length>3 && q.t!=='ABOUT' && q.t!=='OK' && q.t!=='Cindy Shan');
  ok('ABOUT 长文案自动折成多行', abLines.length>=4, 'lines='+abLines.length);
  const abBox=fills.filter(q=>q.c==='#182a4a' && q.w>200);
  ok('ABOUT 弹窗高度随行数自适应放大', abBox.length>0 && Math.max.apply(null,abBox.map(q=>q.h))>92);
  // 署名按惯例靠右对齐：最后一行 Cindy Shan 用 right 对齐且贴弹窗右缘
  const sig=texts.filter(q=>q.t==='Cindy Shan'), body=texts.filter(q=>abLines.indexOf(q)>=0);
  ok('ABOUT 署名 Cindy Shan 改为右对齐', sig.length===1 && sig[0].a==='right',
     'align='+(sig[0]&&sig[0].a));
  ok('ABOUT 署名落在正文右侧', body.length>0 && sig.length===1 &&
     sig[0].x>Math.max.apply(null,body.map(q=>q.x)),
     'sigX='+(sig[0]&&sig[0].x.toFixed(1)));
  ok('ABOUT 正文仍保持左对齐', body.length>0 && body.every(q=>q.a==='left'));
  s.closeModal();
  G.state.screen='DESKTOP'; G.state.startMenu=true;
  clear(); s.draw();
  ok('开始菜单不再有 MUSIC ON / OFF 项', !texts.some(q=>/^MUSIC (ON|OFF)$/.test(q.t)));
  ok('开始菜单精简为 4 项（删掉 LOAD MUSIC）',
     G.regions.filter(q=>/^menu:\d+$/.test(q.key)).length===4);
  ok('ABOUT / RESTART / CLOSE 入口仍在',
     ['ABOUT','RESTART','CLOSE'].every(t=>texts.some(q=>q.t===t)));
  G.state.startMenu=false;

  /* 3 / 13. 道具画在人物身后，书堆与 MacBook 点击即放置 */
  const propIds=Object.keys(G.propPlace);
  ok('6 件手持/使用中道具全部归入人物身后', propIds.every(id=>s.isBehind(at(id))===true));
  ok('18 岁书堆 / MacBook 也归入身后',
     s.isBehind(at('a18_books'))===true && s.isBehind(at('a18_macbook'))===true);
  ok('普通服饰仍画在人物之上',
     [at('a5_top'),at('a8_tshirt'),at('a15_blacktee')].every(x=>s.isBehind(x)===false));
  G.state.screen='DRESSUP'; G.state.unlocked=5; s.openFolder(1);
  G.state.choices.daisy=false;
  G.state.worn={a8_gem:true,a8_sketch:true,a8_tshirt:true}; G.state.slotOwner={};
  clear(); s.draw();
  const iChar=painted.indexOf('char8');
  ok('draw(): 宝石与图画本先于人物绘制',
     iChar>=0 && painted.indexOf('P_gem_hand')>=0 && painted.indexOf('P_sketch_no')>=0 &&
     painted.indexOf('P_gem_hand')<iChar && painted.indexOf('P_sketch_no')<iChar);
  ok('draw(): 衣服仍后于人物绘制', painted.indexOf('L_a8_tshirt')>iChar);

  s.openFolder(4);
  G.state.worn={}; G.state.slotOwner={}; G.state.choices.gem=false; G.state.modal=null;
  s.onItemClick(at('a18_books'));
  ok('点击书堆即放到人物身后且不弹窗',
     G.state.worn.a18_books===true && G.state.modal===null);
  s.onItemClick(at('a18_macbook'));
  ok('点击 MacBook 即放置且保留详情弹窗',
     G.state.worn.a18_macbook===true && !!G.state.modal && G.state.modal.kind==='item');
  ok('书堆用全画布定位图层（图案在左下）',
     s.layerKeyOf(at('a18_books'))==='L_a18_books' && !!G.assets.L_a18_books);
  ok('MacBook 用全画布定位图层（图案在右上）',
     s.layerKeyOf(at('a18_macbook'))==='L_a18_macbook' && !!G.assets.L_a18_macbook);
  G.state.choices.gem=true;
  ok('gem 分支下 MacBook 改放钻石版图层',
     s.layerKeyOf(at('a18_macbook'))==='L_macbook_diamond' && !!G.assets.L_macbook_diamond);
  G.state.choices.gem=false; s.closeModal();
  clear(); s.draw();
  const ic18=painted.indexOf('char18');
  ok('draw(): 书堆 / MacBook 都先于 18 岁人物绘制',
     ic18>=0 && painted.indexOf('L_a18_books')>=0 && painted.indexOf('L_a18_books')<ic18 &&
     painted.indexOf('L_a18_macbook')>=0 && painted.indexOf('L_a18_macbook')<ic18);

  /* 11 / 6. 上衣盖下装、8 岁叠穿且短裙在上 */
  const tops=all.filter(x=>x.slot==='top');
  const bottoms=all.filter(x=>x.slot==='bottom'||x.slot==='bottomBase');
  ok('所有上衣 z 高于所有下装（上衣盖住裤/裙）',
     Math.min.apply(null,tops.map(x=>x.z)) > Math.max.apply(null,bottoms.map(x=>x.z)),
     'topMin='+Math.min.apply(null,tops.map(x=>x.z))+' bottomMax='+Math.max.apply(null,bottoms.map(x=>x.z)));
  ok('8 岁两件下装分槽且短裙 z 更高',
     at('a8_denim').slot==='bottom' && at('a8_trousers').slot==='bottomBase' &&
     at('a8_denim').z>at('a8_trousers').z);
  s.openFolder(1);
  G.state.worn={a8_tshirt:true,a8_denim:true,a8_trousers:true}; G.state.slotOwner={};
  clear(); s.draw();
  const iTr=painted.indexOf('L_a8_trousers'), iDe=painted.indexOf('L_a8_denim'), iTe=painted.indexOf('L_a8_tshirt');
  ok('draw(): 七分裤 → 牛仔短裙 → T恤 的实际绘制顺序',
     iTr>=0 && iDe>iTr && iTe>iDe, 'tr='+iTr+' de='+iDe+' tee='+iTe);

  /* 4 / 5. 按钮再缩小且仍居中；前四场景人物右移 */
  const win=s.winRect(), sb=s.saveBtnRect(win);
  G.state.age=0; const cr0=s.charRect(win);
  G.state.age=3; const cr3=s.charRect(win);
  G.state.age=4; const cr4=s.charRect(win);
  ok('前四个场景人物右移、18 岁保持原位',
     cr0.x>cr4.x && cr3.x>cr4.x && Math.abs(cr0.x-cr3.x)<0.01,
     'x0='+cr0.x.toFixed(1)+' x4='+cr4.x.toFixed(1));
  ok('前四段立绘中心系数收回到 0.31、18 岁仍为 0.285',
     Math.abs((cr0.x+cr0.w/2-win.x)/win.w-0.31)<0.001 &&
     Math.abs((cr4.x+cr4.w/2-win.x)/win.w-0.285)<0.001,
     'cx0='+((cr0.x+cr0.w/2-win.x)/win.w).toFixed(3));
  ok('存档按钮更小、水平仍与圆台居中',
     sb.w===34 && sb.h===22 &&
     Math.abs((sb.x+sb.w/2)-(win.x+win.w*0.2995))<0.01 &&
     Math.abs((sb.y+sb.h/2)-(win.y+win.h*0.95))<0.01);
  ok('按钮顶边落在 5 岁脚底之下，不再压脚',
     sb.y>cr0.y+cr0.h*0.946, 'btnTop='+sb.y.toFixed(1)+' foot='+(cr0.y+cr0.h*0.946).toFixed(1));
  // 下移后要躲开所有年龄段最深的脚底（18 岁 97.7%），且底边仍在窗口内
  const feet=[0.946,0.969,0.952,0.977,0.959].map(f=>cr0.y+cr0.h*f);
  ok('按钮下移后避开全部五个年龄段鞋底',
     sb.y>Math.max.apply(null,feet) && sb.y+sb.h<win.y+win.h,
     'btnTop='+sb.y.toFixed(1)+' deepestFoot='+Math.max.apply(null,feet).toFixed(1));

  /* 7. 15 岁 WARDROBE 标题白色 */
  G.state.screen='DRESSUP'; G.state.modal=null; G.state.worn={}; G.state.slotOwner={};
  G.state.age=3; clear(); s.draw();
  const w15=texts.filter(q=>q.t==='WARDROBE');
  ok('15 岁 WARDROBE 标题改为白色', w15.length>0 && w15.some(q=>q.c==='#ffffff'));
  G.state.age=0; clear(); s.draw();
  const w5=texts.filter(q=>q.t==='WARDROBE');
  ok('其它年龄段 WARDROBE 仍是深蓝', w5.length>0 && w5.every(q=>q.c==='#24509c'));

  /* 8. 拖拽不再画橘色边框 */
  G.state.age=0;
  const [cxc,cyc]=charCenter(s);
  s.beginDrag('wardrobe',at('a5_top'),cxc,cyc);
  clear(); s.draw();
  ok('拖拽时不再画橘色人物/图标边框', !fills.some(q=>q.c==='#f6c344'));
  ok('拖拽仍绘制半透明服饰图标', painted.indexOf('T_a5_top')>=0);
  ok('拖拽文字提示仍为英文', texts.some(q=>q.t==='DROP ON ME TO WEAR'));
  s.cancelDrag();

  /* 9. 新增 Cross necklace */
  const nk=at('a15_necklace');
  ok('15 岁新增 Cross necklace 且无描述', !!nk && nk.name==='Cross necklace' &&
     nk.kind==='wear' && nk.desc==='' && nk.slot==='neck');
  ok('项链可拖拽穿戴', s.draggable(nk)===true && nk.tip===true);
  ok('项链图标与穿戴图层已内联', !!G.assets.T_a15_necklace && !!G.assets.L_a15_necklace);
  ok('项链出现在 15 岁布局表', G.wardrobeLayout[3].some(r=>r.indexOf('a15_necklace')>=0));
  clear(); G.state.tip={item:nk,x:100,y:100};
  const tipBox=s.drawTooltip();
  ok('项链悬浮框只显示名称、不留描述空行',
     !!tipBox && tipBox.h<=26 && texts.length>0 && texts.every(q=>q.t==='Cross necklace'),
     'h='+(tipBox&&tipBox.h)+' texts='+texts.length);
  G.state.tip=null; G.state.age=3; s.wear(nk);
  ok('项链穿上后衣橱图标隐藏', s.wardrobeHidden(nk)===true);
  G.state.worn={}; G.state.slotOwner={};

  /* 12. 15 岁两件 T 恤穿戴图层：从 0.9 上调到 0.97，领口回到肩线 */
  ok('15 岁两件 T 恤 layerScale 上调为 0.97',
     at('a15_blacktee').layerScale===0.97 && at('a15_remake').layerScale===0.97);
  ok('T 恤缩放不再把衣服压到肩膀以下',
     at('a15_blacktee').layerScale>0.95 && at('a15_remake').layerScale>0.95);
  ok('两件 T 恤再上移 5px 贴回肩线',
     at('a15_blacktee').layerDY===-5 && at('a15_remake').layerDY===-5);
  ok('牛仔外套与两件 T 恤同步上移，叠穿时不露 T 恤领口',
     at('a15_jacket').layerDY===at('a15_blacktee').layerDY);
  ok('其它年龄段服饰不受缩放影响',
     !at('a8_tshirt').layerScale && !at('a18_magenta').layerScale);
  /* 17. 18 岁书堆 / MacBook 立绘内道具稍微放大 1.1 倍 */
  ok('书堆与 MacBook 放大 1.1 倍且仍在人物图层之下',
     at('a18_books').layerScale===1.1 && at('a18_macbook').layerScale===1.1 &&
     s.isBehind(at('a18_books')) && s.isBehind(at('a18_macbook')));

  /* 14. 弹窗整体缩小、图片区放大、描述框更窄 */
  const r=s.modalRect(), low=s.choiceImageRect(r), low2=s.itemDescRect(r);
  ok('弹窗尺寸比上一版明显缩小', r.w<=248 && r.h<=226 && r.w<306 && r.h<238,
     'w='+r.w+' h='+r.h);
  const imgH=low.y-(r.y+4+17+2)-2;
  ok('选项弹窗物品大图区反而放大', imgH>85, 'imgH='+imgH.toFixed(1));
  ok('纯详情描述框压得更窄', low2.h<=34 && low2.h<48, 'h='+low2.h.toFixed(1));
  ok('选项素材仍铺满宽度贴底且保持 900:400',
     Math.abs(low.w-(r.w-8))<0.01 &&
     Math.abs(low.y+low.h-(r.y+r.h-4))<0.01 &&
     Math.abs(low.w/low.h-900/400)<0.01);

  /* 19. 雏菊/宝石/笔记本弹窗大图放大且下移 */
  const big=s.choiceBigImageRect(r);
  ok('choice 弹窗大图比旧图区放大 1.18 倍',
     Math.abs(big.h-imgH*1.18)<0.01 && big.w===big.h,
     'bigH='+big.h.toFixed(1)+' oldH='+imgH.toFixed(1));
  ok('choice 大图顶边不再贴标题栏（下移 4px）',
     Math.abs(big.y-(r.y+4+17+2+4))<0.01);
  ok('choice 大图水平居中且底探入选项面板顶部留白',
     Math.abs(big.x+big.w/2-(r.x+r.w/2))<0.01 &&
     big.y+big.h>low.y && big.y+big.h<low.y+low.h*0.35,
     'bottom='+(big.y+big.h).toFixed(1)+' lowTop='+low.y.toFixed(1));
  // 端到端：三个 choice 弹窗都用同一放大矩形绘制大图
  ['a5_daisy','a8_gem','a12_notebook'].forEach(id=>{
    const item=at(id); s.state.modal={kind:'choice',item};
    const draws=[]; const prev=env.ctx.drawImage;
    env.ctx.drawImage=function(im){ if(im&&im._src) draws.push(url2key[im._src]); };
    clear(); s.draw(); env.ctx.drawImage=prev;
    ok(id+' 弹窗大图在面板之后绘制且按放大矩形',
       draws.indexOf(item.big)>=0 && draws.indexOf(item.choiceImg)>=0 &&
       draws.indexOf(item.big)>draws.indexOf(item.choiceImg),
       'draws='+draws.join(','));
  });
}

/* ---------------- 20. 白 T 恤穿上后隐藏衣橱格、拖出脱下后恢复；开始菜单无 LOAD MUSIC ---------------- */
{
  const env=makeEnv(1280,720,1), s=env.sandbox, G=s.PrincessGame;
  const all=G.WARDROBES.reduce((a,b)=>a.concat(b),[]), pick=id=>all.find(x=>x.id===id);
  const remake=pick('a15_remake'), daisy=pick('a5_daisy'), gem=pick('a8_gem');
  s.state.unlocked=5; s.state.choices.notebook=true;
  s.state.screen='DESKTOP'; s.openFolder(3);
  const [ix,iy]=cellCenter(s,'a15_remake');
  const [cx,cy]=charCenter(s), [ox,oy]=outsideChar(s);

  ok('REMAKE T恤仍是 choice 物品，不能从衣橱直接拖穿',
     remake.kind==='choice' && !s.draggable(remake));
  ok('未穿上时白 T 恤衣橱格正常显示', !s.wardrobeHidden(remake));
  ok('白 T 恤标记为穿上后隐藏', remake.hideWhenWorn===true);

  s.choose(remake,true);
  ok('选择 REMAKE T-SHIRT 后确实穿上',
     s.state.worn['a15_remake']===true && s.state.slotOwner.top==='a15_remake');
  s.draw();
  ok('穿上后白 T 恤衣橱格隐藏', s.wardrobeHidden(remake)===true);
  const hidden=s.hit(ix,iy);
  ok('穿上后白 T 恤格不再有点击区', !hidden || hidden.key.indexOf('item:')!==0, hidden&&hidden.key);
  ok('穿上后白 T 恤可从人物身上拖走',
     s.wornWearList().some(x=>x.id==='a15_remake'));

  dragAt(env, cx,cy, ox,oy);
  ok('从人物拖出即脱下白 T 恤并清空上衣槽',
     !s.state.worn['a15_remake'] && !s.state.slotOwner.top && s.state.drag===null);
  s.draw();
  const back=s.hit(ix,iy);
  ok('脱下后白 T 恤图标与点击区恢复',
     !s.wardrobeHidden(remake) && !!back && back.key==='item:a15_remake', back&&back.key);
  ok('脱下后分支标记保留，可重新选择穿上', s.state.choices.remake===true);

  // 其它 choice 道具仍是「使用中道具」，穿上后图标必须留在物品栏
  s.state.worn={}; s.state.slotOwner={};
  s.state.worn['a5_daisy']=true; s.state.worn['a8_gem']=true;
  ok('雏菊/宝石穿上后仍不隐藏衣橱图标',
     !s.wardrobeHidden(daisy) && !s.wardrobeHidden(gem));
  ok('雏菊/宝石不会被误加入可拖脱列表',
     !s.wornWearList().some(x=>x.id==='a5_daisy'||x.id==='a8_gem'));
}

console.log('\n全部通过：'+pass+' 项断言');
