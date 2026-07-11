import type { EvaluationCaseResult, EvaluationDataset, EvaluationEvaluator, EvaluationExperiment, EvaluationRun, EvaluationScore } from "../shared/types";

export async function runEvaluation(input:{experiment:EvaluationExperiment;dataset:EvaluationDataset;evaluators:EvaluationEvaluator[];agentRevisionId?:string;execute:(agentId:string,prompt:string)=>Promise<{output:string;durationMs:number}>}):Promise<EvaluationRun>{
 const startedAt=Date.now();const runId=`eval-run-${startedAt}`;const results:EvaluationCaseResult[]=[];
 for(const item of input.dataset.items)for(let repetition=1;repetition<=Math.max(1,Math.min(5,input.experiment.repetitions));repetition++){
  const caseId=`${runId}:${item.id}:${repetition}`;let output="",durationMs=0,error:string|undefined;
  try{const executed=await input.execute(input.experiment.agentId,item.input);output=executed.output;durationMs=executed.durationMs;}catch(e){error=e instanceof Error?e.message:String(e);}
  const scores=await Promise.all(input.evaluators.filter(e=>input.experiment.evaluatorIds.includes(e.id)&&e.enabled).map(e=>score(e,item.expectedOutput,output,input.execute)));
  results.push({id:caseId,runId,datasetItemId:item.id,repetition,input:item.input,...(item.expectedOutput!==undefined?{expectedOutput:item.expectedOutput}:{}),output,...(error?{error}:{}),durationMs,scores});
 }
 const all=results.flatMap(r=>r.scores);const values=all.map(s=>s.score);const passed=all.filter(s=>s.passed).length;const finishedAt=Date.now();return{id:runId,experimentId:input.experiment.id,status:results.some(r=>r.error)?"failed":"completed",...(input.agentRevisionId?{agentRevisionId:input.agentRevisionId}:{}),startedAt,finishedAt,averageScore:values.length?values.reduce((a,b)=>a+b,0)/values.length:0,minimumScore:values.length?Math.min(...values):0,passRate:all.length?passed/all.length:0,totalDurationMs:finishedAt-startedAt,results};
}
async function score(e:EvaluationEvaluator,expected:string|undefined,output:string,execute:(id:string,prompt:string)=>Promise<{output:string;durationMs:number}>):Promise<EvaluationScore>{const start=Date.now();let value=0,reason:string|undefined;
 if(e.kind==="exact_match")value=output.trim()===(expected??"").trim()?1:0;else if(e.kind==="contains")value=expected&&output.includes(expected)?1:0;else if(e.kind==="json_valid"){try{JSON.parse(output);value=1;}catch{value=0;}}else{try{const r=await execute(e.agentId??"",`${e.prompt??"Score the answer from 0 to 1."}\nExpected: ${expected??"(none)"}\nAnswer: ${output}\nReturn JSON only: {"score": number, "reason": string}`);const parsed=JSON.parse(r.output.match(/\{[\s\S]*\}/)?.[0]??"{}");value=Math.max(0,Math.min(1,Number(parsed.score)||0));reason=typeof parsed.reason==="string"?parsed.reason:undefined;}catch(err){reason=err instanceof Error?err.message:String(err);value=0;}}
 return{evaluatorId:e.id,score:value,passed:value>=e.threshold,...(reason?{reason}:{}),durationMs:Date.now()-start};}
