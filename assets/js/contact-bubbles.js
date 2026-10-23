/* Direct contact channels, independent of the store assistant. */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const labels={pt:'Contacta-nos',en:'Contact us',es:'Contáctanos',de:'Kontakt',fr:'Contactez-nous',it:'Contattaci'};
  const getLabel=()=>labels[document.documentElement.lang.slice(0,2)]||labels.pt;
  const label=getLabel();
  const svg=body=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const channels=[
    ['Instagram','https://www.instagram.com/asheerah_hair',svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".7"/>')],
    ['WhatsApp','https://wa.me/351914522508',svg('<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.2 7.1h1.5l1 2.5-1.2 1.2a8.2 8.2 0 0 0 3.7 3.7l1.2-1.2 2.5 1v1.5a1.2 1.2 0 0 1-1.3 1.2A10.2 10.2 0 0 1 7 8.4a1.2 1.2 0 0 1 1.2-1.3Z"/>')],
    ['TikTok','https://www.tiktok.com/@asheerahhair',svg('<path d="M15 4v9.5a3.5 3.5 0 1 1-2.5-3.4"/><path d="M15 4c.5 2 2 3.5 4.5 4"/>')],
  ];
  const root=document.createElement('div'); root.className='contact-bubbles';
  root.innerHTML=`<div id="contactChannels" class="contact-channels" inert aria-hidden="true">${channels.map(([name,url,icon],i)=>`<a class="contact-bubble" style="--order:${i}" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${name}"><span>${name}</span>${icon}</a>`).join('')}</div><button class="contact-toggle" aria-expanded="false" aria-controls="contactChannels" aria-labelledby="contactToggleLabel">${svg('<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M8 11h8M12 7v8"/>')}<span id="contactToggleLabel" data-i18n="contact_channels_toggle">${label}</span></button>`;
  document.body.append(root);
  const toggle=root.querySelector('button'), links=root.querySelector('.contact-channels');
  const translate=()=>{toggle.querySelector('span').textContent=getLabel();};
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  translate();
  function setOpen(open){root.classList.toggle('is-open',open);toggle.setAttribute('aria-expanded',String(open));links.inert=!open;links.setAttribute('aria-hidden',String(!open));}
  toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))setOpen(false);});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){setOpen(false);toggle.focus();}});
});
