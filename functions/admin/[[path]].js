import { proxyToWorker } from "../_proxy.js";

// Handles every method on /admin/* (tenants, catalog, billing).
export const onRequest = (context) => proxyToWorker(context);
