const data=new Map<string,string>();
export default {async getItem(k:string){return data.get(k)??null;},async setItem(k:string,v:string){data.set(k,v);}};
