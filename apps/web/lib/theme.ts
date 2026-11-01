// Light, dark, or follow the device. The choice is kept per device in localStorage; an inline script in <head>
// applies it before the first paint, so there is no flash of the wrong theme.

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "dhumal.theme";

export const THEME_SCRIPT = `(function(){
var r=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)"),b=document.createElement("meta");
b.name="theme-color";document.head.appendChild(b); // the browser bar's colour; made here so React leaves it alone
function a(){
  var t;try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}
  var d=t==="dark"||(t!=="light"&&m.matches);
  r.setAttribute("data-theme",d?"dark":"light");
  r.style.colorScheme=d?"dark":"light"; // scrollbars and date pickers; set here as the CSS build drops it from a dark rule
  b.content=d?"#0f1218":"#f3f5fb";
}
window.__applyTheme=a;a();
m.addEventListener("change",a);
window.addEventListener("storage",a);
})()`;
