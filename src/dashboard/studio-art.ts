import { STUDIO_ROOMS, STUDIO_WALLS, STUDIO_WIDTH, STUDIO_BASE_HEIGHT, WORK_DESKS, REVIEW_DESKS, WEB_DESK } from "./studio-map";
import { studioMaterial, type StudioPeriod, type StudioTheme } from "./studio-theme";
import { CHAIR_MAP, CHAIR_PALETTE, COMPUTER_MAP, COMPUTER_PALETTE, DESK_MAP, DESK_PALETTE, drawSprite } from "./sprites";

export function drawStudioDesk(ctx: CanvasRenderingContext2D, x: number, y: number, aspect = 1): void {
  ctx.save(); ctx.translate(x + 27, 0); ctx.scale(1 / aspect, 1); ctx.translate(-x - 27, 0);
  ctx.fillStyle = "#202341"; ctx.fillRect(x+6,y+7,54,38);
  drawSprite(ctx,CHAIR_MAP,CHAIR_PALETTE,x+15,y+39,3);
  drawSprite(ctx,DESK_MAP,DESK_PALETTE,x,y,3);
  drawSprite(ctx,COMPUTER_MAP,COMPUTER_PALETTE,x+6,y-18,3);
  ctx.fillStyle = "#e8a08e";ctx.fillRect(x+6,y+6,8,2);ctx.fillRect(x+42,y+8,5,2);
  ctx.fillStyle = "#a45b70";ctx.fillRect(x+8,y+27,12,2);ctx.fillRect(x+37,y+30,8,2);
  ctx.restore();
}

/** Cached artwork. Every solid floor object is represented in studio-map. */
export function drawExpandedOffice(ctx: CanvasRenderingContext2D, theme: StudioTheme, period: StudioPeriod, height: number, extraDesks: ReadonlyArray<readonly [number,number]>, aspect = 1): void {
  const material=(color:string)=>studioMaterial(color,period);
  const p={outer:theme.ui.night,frame:theme.ui.frame,wall:material("#615073"),edge:material("#11162c"),
    tile:material("#30345d"),tileAlt:material("#393d69"),seam:material("#292e55"),glint:material("#4d5078"),
    paper:"#fff1df",ink:"#252743",label:theme.ui.ink,wood:material("#9d5579"),woodLight:material("#e58e86"),
    woodDark:material("#726084"),teal:material("#59bdb7"),gold:theme.ui.accent,sofa:material("#6869a4"),
    sofaDark:material("#45406b"),leaves:material("#59bdb7"),pot:material("#dd917c"),glass:material("#9c86ce")};
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
  const text=(s:string,x:number,y:number,color=p.label,size=17)=>{ctx.save();ctx.translate(x,0);ctx.scale(1/aspect,1);ctx.translate(-x,0);ctx.fillStyle=color;ctx.font=`bold ${size}px "Courier New",monospace`;ctx.textBaseline="top";ctx.fillText(s,x,y);ctx.restore();};
  function plate(s:string,x:number,y:number,color=p.paper) {const w=s.length*10+22;rect(x+3,y+3,w,27,p.edge);rect(x,y,w,27,color);text(s,x+10,y+5,p.ink,16);}
  function floor(x:number,y:number,w:number,h:number,color:string) {
    rect(x,y,w,h,color);
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    for(let row=0,yy=y;yy<y+h;yy+=30,row++)for(let col=0,xx=x-(row%2)*16;xx<x+w;xx+=32,col++){
      ctx.globalAlpha=.16;rect(xx+1,yy+1,30,28,p.tileAlt);
      ctx.globalAlpha=.4;rect(xx,yy,31,1,p.seam);rect(xx,yy,1,30,p.seam);
      ctx.globalAlpha=.48;rect(xx+6,yy+5,5,2,p.glint);
      if((row*19+col*11)%4===0)rect(xx+21,yy+18,3,2,p.glint);
      if((row*19+col*11)%7===0){ctx.globalAlpha=.3;rect(xx+11,yy+23,8,2,p.seam);}
    }
    ctx.restore();
  }
  function plant(x:number,y:number) {
    rect(x+2,y+26,28,7,p.edge);rect(x+8,y+15,16,18,p.pot);rect(x+10,y+16,5,12,p.woodLight);rect(x+15,y-12,5,28,p.sofaDark);
    for(const [dx,dy] of [[0,-4],[6,-15],[17,-20],[24,-8],[12,0]]){rect(x+dx,y+dy,12,8,p.leaves);rect(x+dx+2,y+dy+1,4,2,p.teal);}
  }
  function planter(x:number,y:number,w:number) {rect(x+5,y+12,w,27,p.edge);rect(x,y+8,w,23,p.pot);rect(x+3,y+10,w-6,4,p.woodLight);for(let i=8;i<w-12;i+=21){rect(x+i,y-8,14,20,p.sofaDark);rect(x+i-4,y-5,21,11,p.leaves);rect(x+i+4,y-17,9,20,p.leaves);}}
  function rug(x:number,y:number,w:number,h:number) {
    rect(x+5,y+6,w,h,p.edge);rect(x,y,w,h,p.sofa);rect(x+6,y+6,w-12,h-12,p.sofaDark);
    for(let yy=y+10;yy<y+h-8;yy+=16)for(let xx=x+12;xx<x+w-8;xx+=19){rect(xx,yy,6,2,p.sofa);rect(xx+9,yy+6,2,3,p.glint);}
    rect(x+9,y+9,w-18,2,p.sofa);rect(x+9,y+h-12,w-18,2,p.sofa);
  }
  function chair(x:number,y:number) {rect(x+2,y+5,32,38,p.edge);rect(x,y,32,27,p.woodDark);rect(x+4,y+4,24,10,p.woodLight);rect(x+5,y+30,5,10,p.edge);rect(x+22,y+30,5,10,p.edge);}
  function monitor(x:number,y:number) {rect(x+20,y+35,6,12,p.edge);rect(x+11,y+46,24,4,p.edge);rect(x,y,48,36,p.edge);rect(x+4,y+4,40,27,p.glass);rect(x+8,y+7,32,20,p.sofaDark);rect(x+12,y+12,16,3,p.paper);rect(x+12,y+18,23,2,p.teal);}
  function sofa(x:number,y:number,w:number) {rect(x+5,y+8,w,43,p.edge);rect(x,y,w,36,p.sofaDark);rect(x+5,y+5,w-10,14,p.sofa);rect(x+10,y+21,w-20,10,p.sofa);for(let xx=x+36;xx<x+w-25;xx+=32)rect(xx,y+5,2,27,p.sofaDark);rect(x+3,y+3,12,30,p.glass);rect(x+w-15,y+3,12,30,p.glass);rect(x+25,y+10,14,11,p.woodLight);rect(x+w-45,y+10,14,11,p.woodDark);}
  function table(x:number,y:number,w:number) {rect(x+5,y+8,w,34,p.edge);rect(x,y,w,30,p.wood);rect(x+4,y+4,w-8,3,p.woodLight);rect(x+18,y+13,23,11,p.paper);rect(x+20,y+15,14,2,p.glass);rect(x+w-23,y+11,9,10,p.woodDark);rect(x+w-21,y+11,5,3,p.paper);}
  function art(x:number,y:number,w:number) {rect(x+3,y+4,w,43,p.edge);rect(x,y,w,40,p.woodDark);rect(x+4,y+4,w-8,32,p.paper);rect(x+11,y+10,24,17,p.woodLight);rect(x+38,y+11,w-49,5,p.glass);rect(x+38,y+20,w-49,4,p.teal);}

  rect(0,0,STUDIO_WIDTH,height,p.outer);rect(26,30,1390,height-42,p.edge);rect(32,30,1378,height-51,p.frame);rect(42,41,1358,height-63,p.wall);
  floor(50,132,1342,height-194,p.tile);
  rect(50,47,1342,83,p.wall);plate("OFFICECODE / HQ",67,70,p.woodLight);
  for(const wx of [397,640,883,1126]){
    rect(wx,55,179,62,p.edge);
    for(let band=0;band<3;band++)rect(wx+5,60+band*17,169,18,theme.sky[band]);
    if(period==="night"){rect(wx+134,65,11,11,p.paper);rect(wx+138,63,9,10,theme.sky[0]);}
    else {rect(wx+132,period==="day"?64:80,14,14,"#ffe2a4");rect(wx+20,67,34,4,p.paper);}
    for(let i=0;i<7;i++){const h=18+(i%3)*9;rect(wx+9+i*23,108-h,18,h,theme.skyline);rect(wx+13+i*23,98-h/2,4,5,period==="night"||period==="evening"?"#ffd28b":p.glass);}
    rect(wx+5,105,169,6,p.glass);rect(wx+57,60,5,51,p.wall);rect(wx+115,60,5,51,p.wall);rect(wx+8,62,36,3,p.glint);
  }
  for(const room of STUDIO_ROOMS) {
    floor(room.x,room.y,room.w,room.h,material(room.color));
  }
  // Furnishings form compact islands and leave circulation space around them.
  rect(88,216,234,58,p.edge);rect(83,210,234,58,p.woodDark);
  for(let row=0;row<3;row++){rect(87,214+row*18,226,13,p.edge);for(let i=0,xx=91;xx<305;i++,xx+=10){rect(xx,217+row*18,6,10+i%2*2,[p.woodLight,p.teal,p.glass][i%3]);rect(xx+1,219+row*18,2,2,p.paper);}rect(87,227+row*18,226,3,p.woodLight);}
  art(83,289,60);drawStudioDesk(ctx,WEB_DESK[0],WEB_DESK[1],aspect);plant(295,355);
  rect(595,164,155,34,p.edge);rect(599,168,147,26,p.paper);
  for(const [x,y,color] of [[609,175,p.woodLight],[633,175,p.teal],[657,175,p.glass],[690,175,p.glass],[714,175,p.woodLight]] as const)rect(x,y,15,9,color);
  art(438,278,52);
  for(const x of [513,568,623,678]){chair(x,224);chair(x,337);}
  rect(500,273,236,61,p.edge);rect(504,267,228,61,p.wood);rect(509,272,218,4,p.woodLight);rect(582,286,35,23,p.paper);rect(586,290,22,2,p.glass);rect(638,285,24,17,p.woodDark);rect(642,287,16,11,p.teal);
  plant(462,360);plant(746,363);art(1120,164,78);plant(892,355);plant(1343,355);
  REVIEW_DESKS.forEach(([x,y],i)=>{drawStudioDesk(ctx,x,y,aspect);text(`FOCUS-${i+1}`,x-4,y-40,p.label,13);});
  WORK_DESKS.forEach(([x,y],i)=>{drawStudioDesk(ctx,x,y,aspect);text(`DEV-${i+1}`,x+68,y-10,p.label,13);});
  art(693,543,62);plant(85,746);plant(736,752);
  rect(692,627,65,61,p.edge);rect(697,631,55,47,p.glass);rect(704,628,42,12,p.paper);rect(704,648,37,10,p.woodDark);rect(706,650,6,3,p.teal);rect(704,670,42,3,p.paper);
  rug(95,905,367,130);sofa(118,915,143);sofa(292,915,143);table(215,975,116);plant(111,1026);plant(398,1028);
  rect(546,906,194,76,p.edge);rect(550,900,184,68,p.woodDark);rect(550,900,184,13,p.woodLight);rect(550,913,14,41,p.wood);rect(720,913,14,41,p.wood);rect(564,923,156,40,p.wood);text("WELCOME",594,939,p.paper,16);monitor(657,875);rect(568,910,30,8,p.paper);
  rect(320,874,97,28,p.woodDark);for(let i=0;i<5;i++){rect(325+i*18,878,13,18,p.woodLight);rect(329+i*18,882,5,3,p.paper);}art(471,891,52);plant(744,1009);planter(574,1026,136);
  text("MAIN ENTRANCE",372,1090,p.label,16);
  rect(980,544,281,51,p.edge);rect(984,538,273,48,p.wood);rect(989,542,263,4,p.woodLight);rect(1004,548,41,27,p.edge);rect(1009,552,31,12,p.glass);rect(1017,571,9,9,p.paper);rect(1065,551,35,23,p.paper);rect(1070,555,25,12,p.woodDark);rect(1106,552,9,12,p.paper);rect(1122,552,9,12,p.paper);rect(1180,550,42,27,p.glass);rect(1188,555,22,12,p.woodDark);
  rect(1290,545,54,86,p.edge);rect(1294,549,46,78,p.glass);rect(1298,555,38,37,p.paper);rect(1332,565,3,13,p.edge);rect(1298,599,38,20,p.paper);rect(1332,602,3,10,p.edge);
  rect(1325,677,24,49,p.edge);rect(1328,671,18,22,p.glass);rect(1331,674,11,4,p.paper);rect(1323,693,29,28,p.paper);rect(1328,697,19,11,p.woodDark);rect(1333,696,4,4,p.teal);rect(1328,714,19,3,p.glass);art(897,545,58);
  rug(907,688,422,190);sofa(950,706,150);sofa(1151,808,150);table(1058,769,142);plant(923,820);plant(1289,703);planter(936,1034,129);planter(1193,1039,135);
  text("WAITING LOUNGE",965,895,p.label,17);text("COFFEE BAR",1099,610,p.label,14);
  plant(76,446);plant(1345,448);rect(366,208,18,96,p.woodDark);rect(370,211,10,88,p.glass);
  // Draw the exact shared walls after furniture, with empty doorway openings.
  for(const wall of STUDIO_WALLS){rect(wall.x,wall.y-3,wall.w,wall.h+3,p.edge);rect(wall.x+1,wall.y-2,Math.max(2,wall.w-2),wall.h,p.wall);rect(wall.x+1,wall.y-2,Math.max(2,wall.w-2),2,p.glint);}
  for(const room of STUDIO_ROOMS)plate(room.name,room.x+22,room.y+21,material(room.accent));
  if(extraDesks.length){floor(50,STUDIO_BASE_HEIGHT+5,1342,height-STUDIO_BASE_HEIGHT-68,material("#343660"));plate("TEAM WORKSPACE",76,STUDIO_BASE_HEIGHT+9,material("#cbb5f1"));for(const [x,y] of extraDesks)drawStudioDesk(ctx,x,y,aspect);}
  ctx.save();ctx.beginPath();ctx.rect(50,132,1342,height-194);ctx.clip();
  for(const wx of [397,640,883,1126])for(let band=0;band<5;band++){ctx.globalAlpha=theme.lightStrength*(1-band*.16);rect(wx+16+(period==="evening"?-band*16:band*9),132+band*22,100,22,theme.daylight);}
  for(const x of [540,695])for(let ring=3;ring>=0;ring--){ctx.globalAlpha=theme.lampStrength*.22;rect(x-20-ring*8,249-ring*4,40+ring*16,69+ring*8,"#ffd48c");}
  ctx.restore();
}
