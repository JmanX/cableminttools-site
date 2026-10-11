/** Authorization failures take precedence over network wording and never auto-retry. */
export function gapRetryable(error:unknown):boolean{
 const e=error as {message?:string;code?:string;status?:number;statusCode?:number};
 const text=[e?.message??String(error),e?.code??''].join(' ');
 const status=Number(e?.status??e?.statusCode);
 if(status===401||status===403||/AccessDenied|42501|\b(?:401|403)\b|row.level.security|row.level|RLS|permission[ _-]?denied|not authorized|unauthorized|forbidden/i.test(text))return false;
 return status>=500&&status<=599||/\b(?:5\d\d)\b|network|fetch|timeout|timed out|offline|internet|interrupted|connection|socket|temporarily unavailable/i.test(text);
}
