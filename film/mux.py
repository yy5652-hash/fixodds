import json,subprocess,sys
# Scenes that ran longer than their narration are sped up to fit, so the film has no dead air.
ff=sys.argv[1]; t=json.load(open('film/raw/timing.json')); s=t['starts']; dur=t['dur']; GAP=.5
ids=sorted(s); edges=[0]+[s[k] for k in ids[1:]]+[t['end']]
inputs=['-i',t['path']]; fl=[]; pieces=''; out=0; new={}
for i,k in enumerate(ids):
    a,b=edges[i],edges[i+1]; lead=s[k]-a
    target=(lead+dur[k]+GAP) if i<len(ids)-1 else max(lead+dur[k]+GAP,b-a)
    speed=max(1,(b-a)/target); new[k]=out+lead/speed
    fl.append(f'[0:v]trim={a}:{b},setpts=(PTS-STARTPTS)/{speed}[v{i}]'); pieces+=f'[v{i}]'; out+=(b-a)/speed
fl.append(f'{pieces}concat=n={len(ids)}:v=1:a=0[v]')
mix=''
for i,k in enumerate(ids,1):
    if k=='s5b': continue
    n=sum(1 for x in mix if x=='[')+1; inputs+=['-i',f'film/audio/{k}.wav']; d=int(new[k]*1000); fl.append(f'[{n}:a]adelay={d}|{d}[a{n}]'); mix+=f'[a{n}]'
fl.append(f'{mix}amix=inputs={len(ids)-1}:normalize=0,volume=1.6,apad[a]')
subprocess.run([ff,'-y',*inputs,'-filter_complex',';'.join(fl),'-map','[v]','-map','[a]','-t',f'{out:.2f}','-c:v','libx264','-preset','slow','-crf','24','-pix_fmt','yuv420p','-r','25','-c:a','aac','-b:a','128k','-movflags','+faststart','film/fixodds-demo.mp4'],check=True,stderr=subprocess.DEVNULL)
print(round(out,1),{k:round(v,1) for k,v in new.items()})
