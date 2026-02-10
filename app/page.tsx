"use client";
import dynamic from "next/dynamic";

const FrameFlowApp = dynamic(() => import("./components/FrameFlowApp"), {
  ssr: false,
  loading: () => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"linear-gradient(135deg,#ff6b35,#ff3d71,#7c3aed)"}}>
      <div style={{textAlign:"center",color:"#fff"}}>
        <div style={{fontSize:48,marginBottom:16}}>🪟</div>
        <div style={{fontSize:24,fontWeight:900}}>FrameFlow</div>
        <div style={{fontSize:12,opacity:0.7,marginTop:4}}>Caricamento...</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <FrameFlowApp />;
}
