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

/* ---------------- 1. 数据层 ---------------- */
{
  const {sandbox} = makeEnv(1280, 720, 1);
  const G = sandbox.PrincessGame;
  const counts = G.WARDROBES.map(x=>x.length);
  ok('5 个衣橱数量 4/7/6/10/18', counts.join(',')==='4,7,6,10,18', counts.join(','));
  ok('物品总数 45', counts.reduce((a,b)=>a+b,0)===45);
  ok('年龄段 5/8/12/15/18', G.AGES.map(a=>a.age).join(',')==='5,8,12,15,18');
  ok('内联资源 158 项', Object.keys(G.assets).length===158);
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
    ok('道具 '+id+' 置顶不被衣服盖住', item.z===70);
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
  clickAt(env, v.x+8+48, v.y+8+44*1+20);   // 第 2 个文件夹（锁定）
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
  const base = s.modalRect('choice');
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
  const center=(bb)=>{ const r=s.modalRect('choice'); r.x=V.x+V.w-r.w-V.w*0.045;
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
  ok('没选画画 → 15 岁物品栏 9 件、无 REMAKE',
     idsAt(3).length===9 && idsAt(3).indexOf('a15_remake')===-1);
  s.state.choices.notebook=true;
  ok('选了画画 → 15 岁物品栏 10 件、含 REMAKE',
     idsAt(3).length===10 && idsAt(3).indexOf('a15_remake')!==-1);
  ok('条件物品不影响其它年龄段', [0,1,2,4].every(a=>idsAt(a).length===W[a].length));

  // 端到端：格子、点击区、人物穿戴图层都不该再有 REMAKE
  s.state.choices.notebook=false; idsAt(3); s.draw();
  const g=s.gridOf(s.winRect());
  ok('没选画画时衣橱仍为 3×4 且只有 9 个格子', g.cols===3 && g.rows===4 && g.cells.length===9);
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
  const holes  = [0,1,0,2,2];                        // 各年龄段留空格位数
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
  ok('同 bottom 槽互斥', !s.state.worn[denim.id] && !!s.state.worn[trousers.id]);
  s.wear(trousers);
  ok('再次点击同件可脱下', !s.state.worn[trousers.id]);
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

console.log('\n全部通过：'+pass+' 项断言');
