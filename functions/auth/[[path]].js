import { proxyToWorker } from "../_proxy.js";

// Handles every method on /auth/* (register, login, stripe/*).
export const onRequest = (context) => proxyToWorker(context);
