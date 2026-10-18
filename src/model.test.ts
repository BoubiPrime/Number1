import { describe, expect, it } from 'vitest';
import { circuitKey, demoSessions, formatTime, isSessions, parseTime, stats } from './model';
describe('chronos',()=>{
  it('convertit les formats pris en charge en millisecondes',()=>{expect(parseTime('1:37.317')).toBe(97317);expect(parseTime('97.317')).toBe(97317);expect(parseTime('2:05.840')).toBe(125840);expect(formatTime(125840)).toBe('2:05.840');});
  it('refuse les valeurs ambiguës ou invalides',()=>{for(const value of ['','NaN','-1.000','0.000','1:60.000','1:2','97.31','1:37.317x'])expect(parseTime(value)).toBeNull();});
  it('arrondit avant le passage à la minute',()=>expect(formatTime(59999.7)).toBe('1:00.000'));
});
describe('statistiques',()=>{
  const laps=[{id:'a',number:1,timeMs:100000,valid:true},{id:'b',number:2,timeMs:102000,valid:true},{id:'c',number:3,timeMs:90000,valid:false}];
  it('exclut les tours invalides de tous les calculs',()=>expect(stats(laps)).toEqual({best:100000,mean:101000,spread:2000,deviation:1000,count:2}));
  it('renvoie un état vide sans tour valide',()=>{expect(stats([]).best).toBeNull();expect(stats(laps.map(l=>({...l,valid:false}))).mean).toBeNull();});
  it('gère un seul tour',()=>expect(stats(laps.slice(0,1)).deviation).toBe(0));
});
describe('stockage',()=>{
  it('valide les démos et refuse les structures corrompues',()=>{expect(isSessions(demoSessions())).toBe(true);for(const value of [null,{},[{}],[{...demoSessions()[0],laps:[{id:'x',number:1,timeMs:-1,valid:true}]}]])expect(isSessions(value)).toBe(false);});
  it('refuse les identifiants dupliqués',()=>{const s=demoSessions()[0];expect(isSessions([s,s])).toBe(false);});
  it('normalise le circuit sans rapprocher des pistes différentes',()=>{expect(circuitKey('  SPA-Francorchamps ')).toBe(circuitKey('Spa-Francorchamps'));expect(circuitKey('Monza')).not.toBe(circuitKey('Spa'));});
});

describe('fiabilité des saisies et des données',()=>{
  it('convertit les millisecondes sans dérive décimale',()=>{
    for(const ms of [1,999,1001,97317,59999,125840]) expect(parseTime(formatTime(ms))).toBe(ms);
  });
  it('refuse les dates impossibles et les champs absents',()=>{
    const session=demoSessions()[0];
    for(const date of ['2026-02-30','2026-13-01','2026-00-01','bad']) expect(isSessions([{...session,date}])).toBe(false);
    expect(isSessions([{...session,car:undefined}])).toBe(false);
    expect(isSessions([{...session,circuit:'   '}])).toBe(false);
  });
  it('recalcule après invalidation et modification du meilleur chrono',()=>{
    const laps=[100000,102000,98000,104000,106000].map((timeMs,i)=>({id:String(i),number:i+1,timeMs,valid:true}));
    expect(stats(laps).best).toBe(98000);
    laps[2].valid=false;
    expect(stats(laps)).toEqual({best:100000,mean:103000,spread:6000,deviation:Math.sqrt(5000000),count:4});
    laps[1].timeMs=99000;
    expect(stats(laps).best).toBe(99000);
    expect(stats(laps.filter(l=>l.number!==4)).count).toBe(3);
  });
});
