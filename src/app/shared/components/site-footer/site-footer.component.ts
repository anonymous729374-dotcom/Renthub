import { Component } from '@angular/core';

@Component({
  selector: 'app-site-footer', standalone: true,
  template: `<footer class="footer"><div><strong>Rent<span>Hub</span></strong><p>Find a place that feels like home.</p></div><small>© {{ year }} RentHub</small></footer>`,
  styles: [`:host { display:block; } .footer { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:28px max(20px, calc((100% - 1200px) / 2)); border-top:1px solid #e2e8f0; background:#fff; color:#64748b; } strong { color:#172554; font-size:18px; } strong span { color:#2563eb; } p { margin:5px 0 0; font-size:13px; } small { font-size:12px; } @media (max-width:500px) { .footer { align-items:flex-start; flex-direction:column; } }`],
})
export class SiteFooterComponent { readonly year = new Date().getFullYear(); }
