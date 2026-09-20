"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Hand, X } from "lucide-react";

const MODEL="https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm";

export default function GestureOrdering(){
  const [on,setOn]=useState(false),[msg,setMsg]=useState("Move your finger naturally; pinch to select"),[keyboard,setKeyboard]=useState(false);
  const video=useRef<HTMLVideoElement>(null), canvas=useRef<HTMLCanvasElement>(null), recognizer=useRef<any>(null), stream=useRef<MediaStream|null>(null), raf=useRef<number|null>(null), last=useRef(0), cursorX=useRef<number|null>(null), cursorY=useRef<number|null>(null), clickAt=useRef(0), lastX=useRef<number|null>(null), lastY=useRef<number|null>(null), swipeAt=useRef(0),pinchAt=useRef(false),pinchStart=useRef<{x:number;y:number}|null>(null),pinchMoved=useRef(false),hovered=useRef<HTMLElement|null>(null);

  useEffect(()=>{if(!on)return;let dead=false;const orderForm=document.getElementById("kiosk-order-form");orderForm?.classList.add("eh-gesture-order-form");document.documentElement.classList.add("eh-gesture-active");
    (async()=>{
      try{
        const v=await import("@mediapipe/tasks-vision"), files=await v.FilesetResolver.forVisionTasks(WASM);
        const r=await v.GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:MODEL},runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
        if(dead){r.close();return} recognizer.current=r;
        const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false});
        if(dead){s.getTracks().forEach(t=>t.stop());return} stream.current=s;
        const el=video.current;if(!el)return;el.srcObject=s;await el.play();
        const loop=(t:number)=>{if(dead)return;raf.current=requestAnimationFrame(loop);if(!el.videoWidth||t-last.current<33)return;last.current=t;
          const res=r.recognizeForVideo(el,t),hand=res.landmarks?.[0];draw(hand||[]);
          if(!hand){setMsg("Show your hand");lastX.current=null;lastY.current=null;cursorX.current=null;cursorY.current=null;if(hovered.current){hovered.current.style.outline="";hovered.current=null}return}
          const p=hand[8],x=(1-p.x)*innerWidth,y=p.y*innerHeight;
          const sx=cursorX.current===null?x:cursorX.current+(x-cursorX.current)*.32;
          const sy=cursorY.current===null?y:cursorY.current+(y-cursorY.current)*.32;
          cursorX.current=sx;cursorY.current=sy;
          const cur=document.getElementById("eh-gesture-cursor");
          if(cur){cur.style.transform=`translate3d(${sx}px,${sy}px,0)`;cur.style.opacity="1"}
          const pinch=Math.hypot(hand[4].x-hand[8].x,hand[4].y-hand[8].y)<.055;
          const g=res.gestures?.[0]?.[0]?.categoryName?.replaceAll("_"," ")||"Tracking";
          const now=Date.now();
          const dx=lastX.current===null?0:p.x-lastX.current;
          const dy=lastY.current===null?0:p.y-lastY.current;
          const verticalMove=Math.abs(dy)>.006&&Math.abs(dy)>Math.abs(dx)*1.05;

          // Finger = cursor. Highlight the exact interactive element underneath it.
          const target=document.elementFromPoint(sx,sy) as HTMLElement|null;
          const nextHover=target?.closest<HTMLElement>("button,a,input,textarea,select,label");
          if(nextHover!==hovered.current){
            if(hovered.current) hovered.current.style.outline="";
            hovered.current=nextHover||null;
            if(hovered.current){
              hovered.current.style.outline="3px solid #E3A64B";
              hovered.current.style.outlineOffset="3px";
            }
          }

          setMsg(g+" · "+(pinch?(pinchMoved.current?"drag to scroll":"release to select"):verticalMove?"move to scroll":"move finger"));

          // Pinch acts like a touchscreen press. Drag vertically while pinched
          // to scroll; release without moving to perform a normal tap/click.
          if(pinch&&!pinchAt.current){
            pinchAt.current=true;
            pinchStart.current={x:sx,y:sy};
            pinchMoved.current=false;
            clickAt.current=now;
          } else if(pinch&&pinchAt.current&&pinchStart.current){
            const moveX=sx-pinchStart.current.x;
            const moveY=sy-pinchStart.current.y;
            if(Math.hypot(moveX,moveY)>14)pinchMoved.current=true;
            if(pinchMoved.current&&Math.abs(moveY)>Math.abs(moveX)*.8){
              window.scrollBy({top:-(sy-(lastY.current===null?sy:lastY.current*innerHeight))*1.35,behavior:"auto"});
            }
          } else if(!pinch&&pinchAt.current){
            const wasMoved=pinchMoved.current;
            pinchAt.current=false;
            pinchStart.current=null;
            pinchMoved.current=false;
            if(!wasMoved&&now-clickAt.current>80){
              const clickTarget=document.elementFromPoint(sx,sy) as HTMLElement|null;
              const el2=clickTarget?.closest<HTMLElement>("button,a,input,textarea,select,label");
              if(el2){
                el2.click();
                el2.style.transform="scale(.96)";
                window.setTimeout(()=>{el2.style.transform=""},180);
                if(el2 instanceof HTMLInputElement||el2 instanceof HTMLTextAreaElement){el2.focus();setKeyboard(true)}
              }
            }
          }

          // Horizontal swipe remains navigation, but never while dragging.
          if(!pinch&&lastX.current!==null&&Math.abs(dx)>.22&&Math.abs(dx)>Math.abs(dy)*1.25&&now-swipeAt.current>1200){
            swipeAt.current=now;
            const selector=dx<0?"[data-gesture-next]":"[data-gesture-prev]";
            (document.querySelector(selector) as HTMLElement|null)?.click();
          }
          lastX.current=p.x;
          lastY.current=p.y;
        };raf.current=requestAnimationFrame(loop);
      }catch(e){setMsg(e instanceof Error?e.message:"Camera/gesture setup failed")}
    })();
    const draw=(pts:any[])=>{const c=canvas.current;if(!c)return;const w=c.clientWidth,h=c.clientHeight,d=devicePixelRatio;c.width=w*d;c.height=h*d;const ctx=c.getContext("2d");if(!ctx)return;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
      const lines=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
      ctx.strokeStyle="#E3A64B";ctx.lineWidth=2;lines.forEach(([a,b])=>{const p=pts[a],q=pts[b];if(!p||!q)return;ctx.beginPath();ctx.moveTo((1-p.x)*w,p.y*h);ctx.lineTo((1-q.x)*w,q.y*h);ctx.stroke()});pts.forEach(p=>{ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);ctx.fillStyle="#F6EFDD";ctx.fill()});
    };
    return()=>{dead=true;if(raf.current)cancelAnimationFrame(raf.current);recognizer.current?.close();stream.current?.getTracks().forEach(t=>t.stop());recognizer.current=null;stream.current=null;orderForm?.classList.remove("eh-gesture-order-form");document.documentElement.classList.remove("eh-gesture-active");if(hovered.current){hovered.current.style.outline="";hovered.current=null}};
  },[on]);

  useEffect(()=>{if(!on)return;const f=(e:FocusEvent)=>{const t=e.target;setKeyboard(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement)};document.addEventListener("focusin",f);return()=>document.removeEventListener("focusin",f)},[on]);

  const typeKey=(key:string)=>{const t=document.activeElement;if(!(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement))return;const a=t.selectionStart??t.value.length,b=t.selectionEnd??t.value.length,v=key==="⌫"?t.value.slice(0,Math.max(0,a-1))+t.value.slice(b):t.value.slice(0,a)+key+t.value.slice(b);const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t),"value")?.set;setter?.call(t,v);t.dispatchEvent(new Event("input",{bubbles:true}));t.dispatchEvent(new Event("change",{bubbles:true}));const pos=key==="⌫"?Math.max(0,a-1):a+key.length;t.setSelectionRange(pos,pos)};

  return <><button type="button" onClick={()=>setOn(true)} className="fixed bottom-5 left-5 z-[70] inline-flex items-center gap-2 rounded-full border border-[#E3A64B]/40 bg-[#241c13]/95 px-4 py-3 text-sm font-extrabold text-[#F6EFDD] shadow-2xl"><Hand size={17} className="text-[#E3A64B]"/> Gesture Order</button>
  {on&&<div className="pointer-events-none fixed inset-0 z-[60]">
    <div className="pointer-events-auto absolute inset-3 overflow-hidden rounded-3xl border border-white/15 bg-black/90 shadow-2xl sm:inset-5">
      <div className="relative h-full w-full bg-black">
        <video ref={video} muted playsInline className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"/>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full"/>
        <div className="absolute inset-x-0 top-0 z-[68] flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-4 sm:p-5">
          <div><div className="flex items-center gap-2 text-sm font-extrabold text-white"><Camera size={17} className="text-[#E3A64B]"/> GESTURE ORDER</div><div className="mt-1 text-xs text-white/65">{msg}</div></div>
          <button type="button" onClick={()=>setOn(false)} className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-black/50 text-white"><X size={19}/></button>
        </div>
        <div className="absolute bottom-4 left-4 z-[68] rounded-xl border border-white/15 bg-black/55 px-3 py-2 text-[11px] text-white/75 sm:bottom-5 sm:left-5 sm:text-xs">☝ Move · 🤏 pinch = click · 🤏 drag = scroll · ←/→ swipe = navigate</div>
      </div>
    </div>
    <div id="eh-gesture-cursor" className="absolute left-0 top-0 h-9 w-9 -ml-4.5 -mt-4.5 rounded-full border-2 border-[#E3A64B] bg-[#E3A64B]/30 shadow-[0_0_0_8px_rgba(227,166,75,.15)]"/>
    {keyboard&&<div className="pointer-events-auto absolute bottom-4 left-1/2 z-[75] w-[min(700px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#17110b]/95 p-3 shadow-2xl"><div className="mb-2 flex justify-between text-xs text-white/50"><span>Point at a key and pinch</span><button type="button" onClick={()=>setKeyboard(false)} className="text-[#E3A64B]">Done</button></div><div className="grid grid-cols-10 gap-1">{[..."1234567890QWERTYUIOPASDFGHJKLZXCVBNM"].map(k=><button type="button" key={k} onClick={()=>typeKey(k)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white">{k}</button>)}<button type="button" onClick={()=>typeKey(" ")} className="col-span-7 min-h-10 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white">SPACE</button><button type="button" onClick={()=>typeKey("⌫")} className="col-span-3 min-h-10 rounded-lg border border-[#E3A64B]/20 bg-[#E3A64B]/10 text-xs font-bold text-[#E3A64B]">DELETE</button></div></div>}
    <div className="absolute bottom-5 right-5 z-[68] rounded-xl border border-white/10 bg-[#17110b]/85 px-3 py-2 text-[11px] text-white/60">☝ Move · 🤏 pinch = click · 🤏 drag = scroll · ←/→ swipe = navigate</div>
  </div>}</>;
}