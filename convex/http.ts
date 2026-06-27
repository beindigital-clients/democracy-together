import { httpRouter } from 'convex/server';
import { auth } from './auth';

const http = httpRouter();

// Monte les routes HTTP de Convex Auth (callbacks, tokens).
auth.addHttpRoutes(http);

export default http;
