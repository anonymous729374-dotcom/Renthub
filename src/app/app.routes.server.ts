import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Protected routes depend on the Supabase session stored in browser storage.
  // Rendering them on the server makes the auth guards see an anonymous user
  // because the server cannot read that browser session.
  { path: 'profile', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'apartments/new', renderMode: RenderMode.Client },
  { path: 'apartments/preview', renderMode: RenderMode.Client },
  { path: 'apartments/:id/edit', renderMode: RenderMode.Client },
  { path: 'my-apartments', renderMode: RenderMode.Client },
  { path: 'favourites', renderMode: RenderMode.Client },
  { path: 'messages', renderMode: RenderMode.Client },
  { path: 'inquiries', renderMode: RenderMode.Client },
  {
    path: 'apartments/:id',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
