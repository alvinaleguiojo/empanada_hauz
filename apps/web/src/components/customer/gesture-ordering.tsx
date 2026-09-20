"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Hand, X } from "lucide-react";

const MODEL="https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm";

export default function GestureOrdering(){
  const [on,setOn]=useState(false),[msg,setMsg]=useState("Move your index finger; pinch to click"),[keyboard,setKeyboard]=useState(false);
  const video=useRef<HTMLVideoElement>(null), canvas=useRef<HTMLCanvasElement>(null), recognizer=useRef<any>(null), stream=useRef<MediaStream|null>(null), raf=useRef<number|null>(null), last=useRef(0), clickAt=useRef(0), lastX=useRef<number|null>(null), swipeAt=useRef(0);

  useEffect(()=>{if(!on)return;let dead=false;
    (async()=>{
      try{
        const v=await import("@mediapipe/tasks-vision"), files=await v.FilesetResolver.forVisionTasks(WASM);
        const r=await v.GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:MODEL},runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
        if(dead){r.close();return} recognizer.current=r;
        const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false});
        if(dead){s.getTracks().forEach(t=>t.stop());return} stream.current=s;
        const el=video.current;if(!el)return;el.srcObject=s;await el.play();
        const loop=(t:number)=>{if(dead)return;raf.current=requestAnimationFrame(loop);if(!el.videoWidth||t-last.current<70)return;last.current=t;
          const res=r.recognizeForVideo(el,t),hand=res.landmarks?.[0];draw(hand||[]);
          if(!hand){setMsg("Show your hand");return}
          const p=hand[8],x=(1-p.x)*innerWidth,y=p.y*innerHeight,cur=document.getElementById("eh-gesture-cursor");
          if(cur)cur.style.transform=`translate3d(${x}px,${y}px,0)`;
          const pinch=Math.hypot(hand[4].x-hand[8].x,hand[4].y-hand[8].y)<.055;
          const g=res.gestures?.[0]?.[0]?.categoryName?.replaceAll("_"," ")||"Tracking";
          const now=Date.now();
          setMsg(`${g} · ${pinch?"pinch = select":"move finger"}`);
          if(lastX.current!==null&&Math.abs(p.x-lastX.current)>.22&&now-swipeAt.current>1200){
            swipeAt.current=now;
            const selector=p.x-lastX.current<0?"[data-gesture-next]":"[data-gesture-prev]";
            (document.querySelector(selector) as HTMLElement|null)?.click();
          }
          lastX.current=p.x;
          if(pinch&&now-clickAt.current>850){clickAt.current=now;const target=document.elementFromPoint(x,y) as HTMLElement|null;
            const el2=target?.closest<HTMLElement>("button,a,input,textarea,select,label");if(el2){el2.click();if(el2 instanceof HTMLInputElement||el2 instanceof HTMLTextAreaElement){el2.focus();setKeyboard(true)}}}
        };raf.current=requestAnimationFrame(loop);
      }catch(e){setMsg(e instanceof Error?e.message:"Camera/gesture setup failed")}
    })();
    const draw=(pts:any[])=>{const c=canvas.current;if(!c)return;const w=c.clientWidth,h=c.clientHeight,d=devicePixelRatio;c.width=w*d;c.height=h*d;const ctx=c.getContext("2d");if(!ctx)return;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
      const lines=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
      ctx.strokeStyle="#E3A64B";ctx.lineWidth=2;lines.forEach(([a,b])=>{const p=pts[a],q=pts[b];if(!p||!q)return;ctx.beginPath();ctx.moveTo((1-p.x)*w,p.y*h);ctx.lineTo((1-q.x)*w,q.y*h);ctx.stroke()});pts.forEach(p=>{ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);ctx.fillStyle="#F6EFDD";ctx.fill()});
    };
    return()=>{dead=true;if(raf.current)cancelAnimationFrame(raf.current);recognizer.current?.close();stream.current?.getTracks().forEach(t=>t.stop());recognizer.current=null;stream.current=null};
  },[on]);

  useEffect(()=>{if(!on)return;const f=(e:FocusEvent)=>{const t=e.target;setKeyboard(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement)};document.addEventListener("focusin",f);return()=>document.removeEventListener("focusin",f)},[on]);

  const typeKey=(key:string)=>{const t=document.activeElement;if(!(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement))return;const a=t.selectionStart??t.value.length,b=t.selectionEnd??t.value.length,v=key==="⌫"?t.value.slice(0,Math.max(0,a-1))+t.value.slice(b):t.value.slice(0,a)+key+t.value.slice(b);const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t),"value")?.set;setter?.call(t,v);t.dispatchEvent(new Event("input",{bubbles:true}));t.dispatchEvent(new Event("change",{bubbles:true}));const pos=key==="⌫"?Math.max(0,a-1):a+key.length;t.setSelectionRange(pos,pos)};

  return <><button type="button" onClick={()=>setOn(true)} className="fixed bottom-5 left-5 z-[70] inline-flex items-center gap-2 rounded-full border border-[#E3A64B]/40 bg-[#241c13]/95 px-4 py-3 text-sm font-extrabold text-[#F6EFDD] shadow-2xl"><Hand size={17} className="text-[#E3A64B]"/> Gesture Order</button>
  {on&&<div className="pointer-events-none fixed inset-0 z-[60]">
    <div className="pointer-events-auto absolute right-4 top-4 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#17110b]/90 shadow-2xl">
      <div className="relative aspect-video bg-black"><video ref={video} muted playsInline className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"/><canvas ref={canvas} className="absolute inset-0 h-full w-full"/><span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white"><Camera size={11} className="mr-1 inline"/> HAND TRACKING</span></div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-white/70"><span>{msg}</span><button type="button" onClick={()=>setOn(false)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10"><X size={15}/></button></div>
    </div>
    <div id="eh-gesture-cursor" className="absolute left-0 top-0 h-7 w-7 -ml-3.5 -mt-3.5 rounded-full border-2 border-[#E3A64B] bg-[#E3A64B]/30 shadow-[0_0_0_7px_rgba(227,166,75,.15)]"/>
    {keyboard&&<div className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(700px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#17110b]/95 p-3 shadow-2xl"><div className="mb-2 flex justify-between text-xs text-white/50"><span>Point at a key and pinch</span><button type="button" onClick={()=>setKeyboard(false)} className="text-[#E3A64B]">Done</button></div><div className="grid grid-cols-10 gap-1">{[..."1234567890QWERTYUIOPASDFGHJKLZXCVBNM"].map(k=><button type="button" key={k} onClick={()=>typeKey(k)} className="min-h-10 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white">{k}</button>)}<button type="button" onClick={()=>typeKey(" ")} className="col-span-7 min-h-10 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white">SPACE</button><button type="button" onClick={()=>typeKey("⌫")} className="col-span-3 min-h-10 rounded-lg border border-[#E3A64B]/20 bg-[#E3A64B]/10 text-xs font-bold text-[#E3A64B]">DELETE</button></div></div>}
    <div className="absolute bottom-5 right-5 rounded-xl border border-white/10 bg-[#17110b]/85 px-3 py-2 text-[11px] text-white/60">☝ Move · 🤏 pinch = select · ←/→ swipe = navigate</div>
  </div>}</>;
}