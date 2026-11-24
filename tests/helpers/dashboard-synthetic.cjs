'use strict';
// Pure synthetic test fixtures; no HTTP listener or public session bootstrap.
const crypto=require('node:crypto');
const {workflow}=require('../../backend/dashboard-tracking.cjs');
const ID='00000000-0000-4000-8000-00000000de01';
function fixture(){return {version:0,order:{id:ID,createdAt:'2026-11-24T10:00:00Z',method:'stripe',status:'paid',customer:{name:'Cliente Demonstração',email:'cliente@example.invalid',address:'Rua Fictícia 12, Lisboa'},items:[{title:'Lamara Chocolate',variant:'Castanho chocolate · 18 polegadas',qty:1}],subtotalCents:15000,discountCents:0,shippingCents:1000,totalCents:16000,fulfillmentMethod:'shipping',fulfillmentAddress:'Rua Fictícia 12, Lisboa'},operations:{stage:'courier_accepted'},tracking:null,messages:[],audit:[]};}
function memoryStore(initial=fixture()){
 let value=structuredClone(initial),revision=0;
 return {async read(id){return id===value.order.id?{value:structuredClone(value),etag:String(revision)}:null},async cas(id,etag,next){if(id!==value.order.id||etag!==String(revision))return false;value=structuredClone(next);revision++;return true}};
}
function createDemo(){
 const store=memoryStore(),calls=[],accepted=new Map();
 const flow=workflow({store,secret:crypto.randomBytes(32).toString('hex'),provider:async request=>{calls.push(request);if(!accepted.has(request.idempotencyKey))accepted.set(request.idempotencyKey,'fake-'+crypto.randomUUID());return {status:'accepted',id:accepted.get(request.idempotencyKey)}}});
 return {flow,store,calls,ID};
}
module.exports={fixture,memoryStore,createDemo,ID};
