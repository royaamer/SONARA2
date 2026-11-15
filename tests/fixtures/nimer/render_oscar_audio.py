#!/usr/bin/env python3
"""Reproducible, original 25-second musical sonification from OSCAR daily NetCDF u/v.

Dependencies: numpy scipy xarray soundfile; plus netCDF4 for NASA's NetCDF4 files.
Run: python render_oscar_audio.py --data data/raw/oscar/2023-11 --out data/processed/oscar/audio_previews

Three renders share an IDENTICAL daily data->score mapping, differ in instrumentation/mix.
No generated note claims to be a physical recording of ocean sound.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import xarray as xr
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 24000
DURATION = 25.0
SCALE = np.array([45, 48, 50, 52, 53, 55, 57, 60, 62, 64, 65, 67, 69, 72, 74])  # D minor and modal extension
REGIONS = {
    'gulf_stream': (-83, -40, 26, 52),
    'kuroshio': (120, 169, 22, 52),
    'agulhas': (10, 51, -48, -26),
}

def statistics(path):
    with xr.open_dataset(path) as ds:
        la = ds['lat'].values.astype(float)
        lo = ((ds['lon'].values.astype(float) + 180) % 360) - 180
        u = ds['u'].isel(time=0).transpose('latitude','longitude').values.astype(float)
        v = ds['v'].isel(time=0).transpose('latitude','longitude').values.astype(float)
    sp = np.hypot(u, v)
    weights = np.cos(np.deg2rad(la)).clip(0.01, 1)[:, None] * np.ones((1, len(lo)))
    ok = np.isfinite(sp)
    if ok.sum() < 100: raise ValueError(f'Insufficient valid velocities in {path}')
    def avg(arr, mask):
        return float(np.average(arr[mask], weights=weights[mask])) if mask.any() else None
    out = {'global': {'speed':avg(sp,ok), 'u':avg(u,ok), 'v':avg(v,ok)}}
    for name,(west,east,south,north) in REGIONS.items():
        mask=ok & (la[:,None]>=south)&(la[:,None]<=north)&(lo[None,:]>=west)&(lo[None,:]<=east)
        out[name] = {'speed':avg(sp,mask),'u':avg(u,mask),'v':avg(v,mask), 'cells':int(mask.sum())}
        if out[name]['speed'] is None: raise ValueError(f'No velocity cells in {name}: {path}')
    return out

def compile_score(days):
    # The same mapping and note sequence are used for all three listening comparisons.
    n=len(days)
    note_count = 16
    event_len = DURATION/note_count
    events=[]
    prev_idx=6
    keys=list(REGIONS)
    for i in range(note_count):
        day_pos = i*(n-1)/(note_count-1)
        day_index=int(day_pos)
        a=day_pos-day_index
        other=min(n-1,day_index+1)
        region=keys[(i//4)%len(keys)]
        s=(1-a)*days[day_index]['metrics'][region]['speed'] + a*days[other]['metrics'][region]['speed']
        u=(1-a)*days[day_index]['metrics'][region]['u'] + a*days[other]['metrics'][region]['u']
        v=(1-a)*days[day_index]['metrics'][region]['v'] + a*days[other]['metrics'][region]['v']
        # Stable, documented thresholds (m/s), with bounded stepwise voice-leading.
        desired=int(np.clip(round(4.5+5.0*np.tanh((s-0.23)/0.35)+1.0*np.tanh(v/0.3)),1,len(SCALE)-2))
        idx=int(np.clip(desired,prev_idx-2,prev_idx+2))
        prev_idx=idx
        events.append({'at_seconds':round(i*event_len,4),'duration_seconds':round(event_len*1.30,4),
                       'region':region,'data_day_position':round(day_pos,4),
                       'velocity_speed_mps':round(s,6),'velocity_east_mps':round(u,6),'velocity_north_mps':round(v,6),
                       'midi_note':int(SCALE[idx]),
                       'amplitude':round(float(np.clip(0.28+0.45*s,0.28,0.70)),4),
                       'pan':round(float(np.clip(u/1.2,-0.50,0.50)),4)})
    return events

def midi_hz(midi): return 440.0*2**((midi-69)/12)

def add_note(buf, at, duration, midi, amp, pan, instrument='string'):
    start=int(at*SR)
    length=min(len(buf)-start, int((duration+0.45)*SR))
    if length <= 0:return
    t=np.arange(length)/SR
    attack=0.22 if instrument=='string' else 0.75
    release=0.55 if instrument=='string' else 1.3
    env=np.minimum(1,t/attack)*np.minimum(1,np.maximum(0,duration+release-t)/release)
    env=np.clip(env,0,1)**1.1
    freq=midi_hz(midi)
    # Continuous phase modulation mimics an ensemble; no samples or copyrighted recordings.
    vib=0.0023*np.sin(2*np.pi*5.05*t)+0.0009*np.sin(2*np.pi*4.67*t+.3)
    phase=2*np.pi*freq*(t+np.cumsum(vib)/SR)
    if instrument=='string':
        wave=(np.sin(phase)+.27*np.sin(2*phase+.16)+.13*np.sin(3*phase+.33)+.065*np.sin(4*phase))/.99
        wave+=.14*np.sin(phase*1.002+.6)
    elif instrument=='cello':
        wave=(np.sin(phase)+.36*np.sin(2*phase+.2)+.18*np.sin(3*phase+.45)+.07*np.sin(4*phase))/.95
    else:
        wave=(np.sin(phase)+.18*np.sin(2*phase+.4))/.99
    wave=wave*env*amp
    left=np.sqrt((1-pan)*.5)
    right=np.sqrt((1+pan)*.5)
    buf[start:start+length,0]+=wave*left
    buf[start:start+length,1]+=wave*right

def warm_drone(buf, days, level=.25, dark=False):
    t=np.arange(len(buf))/SR
    speeds=np.array([d['metrics']['global']['speed'] for d in days])
    interp=np.interp(np.linspace(0,len(speeds)-1,len(t)),np.arange(len(speeds)),speeds)
    brightness=np.clip(.4+interp/1.2,.4,.9)
    # Continuous fundamental D2/A2, slightly detuned, gentle envelope, little mechanical repetition.
    wave=np.sin(2*np.pi*73.416*t+.3*np.sin(2*np.pi*.08*t))
    wave+=.35*np.sin(2*np.pi*110.0*t+.27*np.sin(2*np.pi*.067*t))
    wave+=.10*brightness*np.sin(2*np.pi*146.83*t)
    if dark:
        wave+=.15*np.sin(2*np.pi*55*t)
    env=np.minimum(1,t/2)*np.minimum(1,np.maximum(0,DURATION-t)/2)
    buf[:,0]+=level*wave*env*.70
    buf[:,1]+=level*wave*env*.73

def ambience(buf, level=.08):
    rng=np.random.default_rng(1729)
    n=len(buf)
    noise=rng.normal(0,1,n)
    sos=butter(3, [130, 600], btype='bandpass',fs=SR,output='sos')
    col=sosfilt(sos,noise)
    col/=max(1e-8,np.std(col))*7
    t=np.arange(n)/SR
    slow=.55+.45*np.sin(2*np.pi*.085*t)**2
    buf[:,0]+=level*col*slow
    buf[:,1]+=level*np.roll(col,161)*slow

def soften(buf):
    # Subtle short, decorrelated echo without harsh repeats.
    for shift,gain in [(int(.19*SR),.08),(int(.37*SR),.045)]:
        buf[shift:,0]+=gain*buf[:-shift,1].copy()
        buf[shift:,1]+=gain*buf[:-shift,0].copy()
    peak=float(np.max(np.abs(buf)))
    if peak>0:buf*=.78/max(.78,peak)
    return buf.astype('float32')

def render(days,events,version):
    out=np.zeros((int(DURATION*SR),2),dtype=np.float64)
    if version=='orchestral':
        warm_drone(out,days,level=.12)
        for e in events:
            add_note(out,e['at_seconds'],e['duration_seconds'],e['midi_note'],.23*e['amplitude'],e['pan'],'string')
            add_note(out,e['at_seconds'],e['duration_seconds']*1.15,e['midi_note']-12,.12*e['amplitude'],e['pan']*.55,'cello')
    elif version=='deep_ocean':
        warm_drone(out,days,level=.36,dark=True)
        ambience(out,level=.065)
        # Sparse, extended tones from exactly the same note mapping.
        for e in events[::4]:
            add_note(out,e['at_seconds'],5.4,e['midi_note']-12,.105*e['amplitude'],e['pan']*.7,'pad')
    else:
        warm_drone(out,days,level=.24,dark=True)
        ambience(out,level=.026)
        for e in events[::2]:
            add_note(out,e['at_seconds'],e['duration_seconds']*1.85,e['midi_note'],.17*e['amplitude'],e['pan'],'string')
            add_note(out,e['at_seconds'],e['duration_seconds']*2.1,e['midi_note']-12,.095*e['amplitude'],e['pan']*.5,'cello')
    return soften(out)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--data',type=Path,required=True,help='Directory with OSCAR NetCDF daily files')
    p.add_argument('--out',type=Path,default=Path('data/processed/oscar/audio_previews'))
    p.add_argument('--max-days',type=int,default=30)
    p.add_argument('--demo',action='store_true',help='Explicitly identify synthetic demonstration input')
    args=p.parse_args()
    files=sorted(args.data.glob('oscar_currents_final_*.nc'))[:args.max_days]
    if len(files)<2:raise SystemExit('Need at least 2 daily .nc files')
    dates=[x.stem[-8:] for x in files]
    import datetime
    ds=[datetime.datetime.strptime(x,'%Y%m%d') for x in dates]
    if any((b-a).days!=1 for a,b in zip(ds,ds[1:])):raise SystemExit('Files must cover consecutive days without gaps')
    args.out.mkdir(parents=True,exist_ok=True)
    days=[]
    for f in files:
        print('Reading',f.name,flush=True)
        days.append({'date':f.stem[-8:],'metrics':statistics(f)})
    events=compile_score(days)
    for name in ['orchestral','deep_ocean','hybrid']:
        audio=render(days,events,name)
        fname=args.out/f'{name}_{"SYNTHETIC_DEMO" if args.demo else "OSCAR"}.wav'
        sf.write(fname,audio,SR,subtype='PCM_16')
        print('Created',fname, 'peak=',round(float(np.max(np.abs(audio))),3))
    audit={'provenance':'SYNTHETIC TEST DATA - NOT NASA' if args.demo else 'NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0 files supplied by user',
           'source_files':[f.name for f in files], 'duration_seconds':DURATION,
           'method':'Area-weighted daily regional u/v/speed; linearly interpolate between daily values; fixed D-minor note vocabulary; bounded 2-scale-step voice leading; same note score across styles; instrumentation differs.',
           'region_bounds':REGIONS,'days':days,'note_events':events}
    (args.out/'sonification_audit.json').write_text(json.dumps(audit,indent=2))
    print('Created',args.out/'sonification_audit.json')
if __name__=='__main__':main()
