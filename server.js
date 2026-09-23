require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));

const required = ["SUPABASE_URL","SUPABASE_KEY","META_ACCESS_TOKEN"];
for (const k of required) if (!process.env[k]) console.warn(`Missing env: ${k}`);

const db = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_KEY || "");
const sha = v => crypto.createHash("sha256").update(v).digest("hex");
const cleanEmail = v => (v || "").trim().toLowerCase();
const cleanPhone = v => (v || "").replace(/\D/g,"");
const cleanName = v => (v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const apiVersion = () => process.env.META_API_VERSION || "v24.0";

app.get("/health", (_,res)=>res.json({ok:true, mode:process.env.META_MODE || "APP_EVENTS"}));

app.get("/api/buyers", async (_,res)=>{
  const {data,error}=await db.from("buyers").select("*").order("created_at",{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.post("/api/buyers", async (req,res)=>{
  const {name,email,phone,value,currency="BRL"}=req.body;
  if(!name || value===undefined) return res.status(400).json({error:"Nome e valor são obrigatórios."});
  const {data,error}=await db.from("buyers").insert({
    name,email:email||null,phone:phone||null,value:Number(value),currency
  }).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

async function sendCapi(buyer,eventId){
  if(!process.env.META_DATASET_ID) throw new Error("META_DATASET_ID não configurado.");
  const user_data={};
  if(buyer.email) user_data.em=[sha(cleanEmail(buyer.email))];
  if(buyer.phone) user_data.ph=[sha(cleanPhone(buyer.phone))];
  const parts=cleanName(buyer.name).split(/\s+/).filter(Boolean);
  if(parts[0]) user_data.fn=[sha(parts[0])];
  if(parts.length>1) user_data.ln=[sha(parts[parts.length-1])];

  const event={
    event_name:"Purchase",
    event_time:Math.floor(Date.now()/1000),
    event_id:eventId,
    action_source:"chat",
    user_data,
    custom_data:{value:Number(buyer.value),currency:buyer.currency || "BRL"}
  };
  const body={data:[event]};
  if(process.env.META_TEST_EVENT_CODE) body.test_event_code=process.env.META_TEST_EVENT_CODE;
  const url=`https://graph.facebook.com/${apiVersion()}/${process.env.META_DATASET_ID}/events?access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN)}`;
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const out=await r.json();
  if(!r.ok) throw new Error(JSON.stringify(out));
  return out;
}

async function sendAppEvents(buyer,eventId){
  if(!process.env.META_APP_ID) throw new Error("META_APP_ID não configurado.");
  const attrs={
    _eventName:"fb_mobile_purchase",
    _valueToSum:Number(buyer.value),
    fb_currency:buyer.currency || "BRL",
    event_id:eventId
  };
  // App Events exige parâmetros compatíveis com o App configurado na Meta.
  const form=new URLSearchParams();
  form.set("access_token",process.env.META_ACCESS_TOKEN);
  form.set("event","CUSTOM_APP_EVENTS");
  form.set("custom_events",JSON.stringify([attrs]));
  form.set("advertiser_tracking_enabled","1");
  form.set("application_tracking_enabled","1");
  const url=`https://graph.facebook.com/${apiVersion()}/${process.env.META_APP_ID}/activities`;
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form});
  const out=await r.json();
  if(!r.ok) throw new Error(JSON.stringify(out));
  return out;
}

app.post("/api/buyers/:id/send-purchase", async (req,res)=>{
  const {data:buyer,error}=await db.from("buyers").select("*").eq("id",req.params.id).single();
  if(error || !buyer) return res.status(404).json({error:"Compradora não encontrada."});

  const existing=await db.from("meta_events").select("*").eq("buyer_id",buyer.id).eq("status","sent").maybeSingle();
  if(existing.data) return res.status(409).json({error:"Purchase já enviado para esta compradora.",event:existing.data});

  const eventId=`purchase_${buyer.id}`;
  const mode=(process.env.META_MODE || "APP_EVENTS").toUpperCase();
  const inserted=await db.from("meta_events").upsert(
    {buyer_id:buyer.id,event_id:eventId,mode,status:"pending"},
    {onConflict:"event_id"}
  ).select().single();
  if(inserted.error) return res.status(500).json({error:inserted.error.message});

  try{
    const metaResponse=mode==="CAPI" ? await sendCapi(buyer,eventId) : await sendAppEvents(buyer,eventId);
    await db.from("meta_events").update({status:"sent",meta_response:metaResponse,sent_at:new Date().toISOString()}).eq("event_id",eventId);
    res.json({ok:true,mode,event_id:eventId,meta_response:metaResponse});
  }catch(e){
    await db.from("meta_events").update({status:"error",meta_response:{error:e.message}}).eq("event_id",eventId);
    res.status(502).json({ok:false,mode,event_id:eventId,error:e.message});
  }
});

app.listen(process.env.PORT || 3000,()=>console.log("meta-purchase-bridge online"));
