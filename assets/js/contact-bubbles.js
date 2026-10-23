/* Direct WhatsApp contact, independent of the store assistant. */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const labels={pt:'Contacta-nos pelo WhatsApp',en:'Contact us on WhatsApp',es:'Contáctanos por WhatsApp',de:'Kontaktiere uns über WhatsApp',fr:'Contactez-nous sur WhatsApp',it:'Contattaci su WhatsApp'};
  const root=document.createElement('div');
  root.className='contact-bubbles';
  root.innerHTML='<a class="contact-whatsapp" href="https://wa.me/351914522508" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.2 7.1h1.5l1 2.5-1.2 1.2a8.2 8.2 0 0 0 3.7 3.7l1.2-1.2 2.5 1v1.5a1.2 1.2 0 0 1-1.3 1.2A10.2 10.2 0 0 1 7 8.4a1.2 1.2 0 0 1 1.2-1.3Z"/></svg></a>';
  const link=root.querySelector('a');
  const translate=()=>{
    const label=labels[document.documentElement.lang.slice(0,2)]||labels.pt;
    link.setAttribute('aria-label',label);
    link.title=label;
  };
  translate();
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.body.append(root);
});
