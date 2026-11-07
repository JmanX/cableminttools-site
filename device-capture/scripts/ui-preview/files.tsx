export const Paths={cache:{uri:'file:///preview-cache/'}};
export class File {uri:string;exists=true;constructor(...parts:any[]){this.uri=parts.map(p=>p.uri??p).join('');}delete(){this.exists=false;}async copy(){} }
