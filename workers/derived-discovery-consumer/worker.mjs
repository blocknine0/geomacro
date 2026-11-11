/**
 * Isolated, non-HTTP Queue consumer for protected website discovery ACKs.
 * Shares the reviewed atomic D1 writer; no public route, payments, source
 * publisher fetch, scoring or GRI signing.
 */
import {consumeDerivedDiscoveryQueue}
 from "../control-plane/src/derived-discovery-queue.mjs";

export default {
 async fetch(){return new Response("Not found",{status:404});},
 async queue(batch,env){await consumeDerivedDiscoveryQueue(batch,env);}
};
