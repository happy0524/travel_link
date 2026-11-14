// Procedural pigment for our DEMO shapes only. Not a filter on Google content.
// SourceGraphic clips the grain to each water/park shape; geometry stays intact.
export const watercolorPaintDefs = `<filter id="atlas-pigment" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
 <feTurbulence type="fractalNoise" baseFrequency=".018 .045" numOctaves="3" seed="31" stitchTiles="stitch" result="pigment"/>
 <feColorMatrix in="pigment" type="matrix" values="0 0 0 0 .12 0 0 0 0 .15 0 0 0 0 .18 0 0 0 .3 0" result="ink"/>
 <feComposite in="ink" in2="SourceGraphic" operator="in" result="clipped"/>
 <feBlend in="SourceGraphic" in2="clipped" mode="multiply"/>
</filter>`;
