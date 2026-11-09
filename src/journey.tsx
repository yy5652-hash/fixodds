import { createContext, useContext, useState, type ReactNode } from 'react';
import { blankInput, intentions, readJobs, sameItem, saveJobs, saveStep, confirmEnquiry, type Input, type Intention, type Job, type SavedStep } from './core';
import { t, useLang } from './i18n';
type JobsState = { jobs: Job[]; error: string; update: (jobs: Job[]) => void };
const JobsContext = createContext<JobsState | null>(null);
export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs,setJobs] = useState(readJobs), [error,setError] = useState('');
  function update(next: Job[]) { setJobs(next); setError(saveJobs(next)); }
  return <JobsContext.Provider value={{jobs,error,update}}>{children}</JobsContext.Provider>;
}
export function useJobs() { const state=useContext(JobsContext); if(!state)throw Error('Missing JobsProvider'); return state; }
export function IntentionField({ value, onChange }: { value?: Intention; onChange: (value?: Intention) => void }) {
  useLang();
  const names = { replace:'Replace', discard:'Discard', repair:'Repair', undecided:'Undecided' };
  return <label>{t("What were you planning to do?")} <span className="optional">{t("optional")}</span><select value={value||''} onChange={e=>onChange(e.target.value as Intention||undefined)}><option value="">{t("Not supplied")}</option>{intentions.map(i=><option key={i} value={i}>{t(names[i])}</option>)}</select></label>;
}
export function stepText(job: Job) { return job.next?.startsWith('Follow the guide: ') ? t('Follow the guide: {title}', { title: job.next.slice(18) }) : t(job.next || 'Choose a next step'); }
export function SaveStepButton({ input, step }: { input?: Input | null; step: SavedStep }) {
  useLang();
  const { jobs,error,update } = useJobs();
  const [saved,setSaved] = useState(false);
  return <><button type="button" className="secondary" onClick={()=>{update(saveStep(jobs,input||blankInput,step));setSaved(true);}}>{t("Make this my next step")}</button>{saved&&<p className="small" role="status">{t(error||"Next step added to your tracker.")} <a href="#/log">{t("Open tracker")}</a></p>}</>;
}
export function EnquiryConfirmation({ job }: { job: Job }) {
  useLang();
  const { jobs,update } = useJobs();
  if(job.stage!=='Enquiry sent?')return null;
  return <div className="notice"><strong>{t("Enquiry sent?")}</strong><p className="small">{t("Opening an app does not confirm sending.")}</p><div className="actions">{[true,false].map(sent=><button type="button" key={String(sent)} className={sent?'primary':'secondary'} onClick={()=>update(jobs.map(j=>j.id===job.id?confirmEnquiry(j,sent):j))}>{t(sent?'Yes, I sent it':'Not yet')}</button>)}</div></div>;
}
export function NextStepCard({ input }: { input: Input }) {
  useLang();
  const { jobs,error,update } = useJobs();
  const job=jobs.find(j=>j.stage!=='Done'&&sameItem(j.input,input));
  if(!input.category||!job)return null;
  return <section className="card next-step"><p>{job.stepDone?t("Step marked done."):t('Your next step: {step}',{step:stepText(job)})}</p><div className="actions"><a className="button secondary" href="#/log">{t("Open tracker")}</a>{!job.stepDone&&job.stage!=='Enquiry sent?'&&<button type="button" onClick={()=>update(jobs.map(j=>j.id===job.id?{...j,stepDone:true}:j))}>{t("Mark step done")}</button>}</div><EnquiryConfirmation job={job}/>{error&&<p role="alert">{t(error)}</p>}</section>;
}
