import { it } from "node:test";
import assert from "node:assert/strict";
import { stationForRun, waitingFor, currentWorkActivity, type WorkflowRun } from "../src/dashboard/studio-workflow.js";
import { waitingStops, waitingDestination } from "../src/dashboard/studio-waiting.js";
import { allocateStudioSeats, studioGeometry } from "../src/dashboard/studio-seating.js";
import { planRoute } from "../src/dashboard/agent-motion.js";

const parent: WorkflowRun = { id:"parent",sessionId:"parent-session",role:"plan",prompt:"Plan feature",state:"acting",activity:"delegating",activeTools:[{id:"task",name:"task",activity:"delegating",detail:"Build API"}] };
const child: WorkflowRun = { id:"child",sessionId:"child-session",parentSessionId:"parent-session",role:"backend-dev",prompt:"Build API",state:"acting",activity:"editing" };

it("routes actual activities and review roles to their furnished rooms",()=>{
  const cases = [
    ["arriving","build","walking","arrival"], ["editing","build","acting","editing"],
    ["reading","build","acting","reading"], ["code-search","build","acting","reading"],
    ["web-search","build","acting","web-search"], ["terminal","build","acting","terminal"],
    ["thinking","plan","thinking","thinking"], ["delegating","plan","acting","delegating"],
    ["reading","reviewer","acting","review"], ["terminal","qa-engineer","acting","review"],
    ["working","reviewer","acting","review"], ["web-search","reviewer","acting","web-search"],
  ] as const;
  for(const [activity,role,state,want] of cases)assert.equal(stationForRun({id:"one",role,prompt:"Feature",state,activity},[]),want);
  assert.equal(stationForRun({id:"one",role:"build",prompt:"Audit account integration",state:"acting",activity:"reading"},[]),"review","A Fullstack label does not prevent single-agent audit work in the focus room");
});

it("waits only when a real delegation tool has an active direct child",()=>{
  assert.equal(stationForRun(parent,[parent,child]),"waiting");
  assert.deepEqual(waitingFor(parent,[parent,child]).map(r=>r.id),["child"]);
  assert.equal(stationForRun({...parent,activeTools:[]},[parent,child]),"delegating");
  assert.equal(stationForRun(parent,[parent,{...child,parentSessionId:"another-parent"}]),"delegating");
  for(const state of ["done","blocked"])assert.equal(stationForRun(parent,[parent,{...child,state}]),"delegating");
  assert.equal(stationForRun({...parent,sessionId:undefined},[parent,child]),"delegating");
});

it("keeps permission and local concurrent work ahead of delegation waiting",()=>{
  const read={id:"read",name:"read",activity:"reading",detail:"Read local file"};
  assert.equal(stationForRun({...parent,activeTools:[read,...parent.activeTools!]},[parent,child]),"reading");
  assert.equal(waitingFor({...parent,activeTools:[read,...parent.activeTools!]},[parent,child]).length,0);
  assert.equal(stationForRun({...parent,state:"waiting-approval",activity:"approval"},[parent,child]),"approval");
  assert.equal(waitingFor({...parent,state:"waiting-approval",activity:"approval"},[parent,child]).length,0);
  assert.equal(currentWorkActivity({...parent,state:"waiting-approval",activity:"approval",activeTools:[read,...parent.activeTools!]}),"approval");
});

it("gives every lounge wait a reachable circuit with straight collision-safe paths",()=>{
  const seats=allocateStudioSeats(Array.from({length:8},(_,i)=>({id:`wait-${i}`,station:"waiting" as const})));
  const geometry=studioGeometry(seats);
  for(const seat of seats.values()){
    let from=seat.point;
    for(const to of waitingStops(seat)){
      const route=planRoute(from,to,geometry.obstacles,geometry.height-24);
      assert.ok(route,`${seat.id} cannot reach ${JSON.stringify(to)}`);
      for(const point of route){assert.ok(from.x===point.x||from.y===point.y);from=point;}
      assert.deepEqual(from,to);
    }
  }
});

it("pauses at waiting stops instead of repeatedly replanning or walking continuously",()=>{
  const seat=allocateStudioSeats([{id:"waiting",station:"waiting"}]).get("waiting")!;
  const schedule={step:0,pauseUntil:undefined as number|undefined};
  assert.equal(waitingDestination(seat,schedule,1000,false),undefined,"in transit");
  assert.equal(waitingDestination(seat,schedule,2000,true),undefined,"start a pause");
  assert.equal(waitingDestination(seat,schedule,5499,true),undefined,"still pausing");
  assert.ok(waitingDestination(seat,schedule,5500,true),"leave after 3.5 seconds");
  assert.equal(waitingDestination(seat,schedule,5501,false),undefined,"keep the current route");
  const overflow={...seat,id:"annex-0",point:{x:181,y:1256}};
  assert.deepEqual(waitingStops(overflow),[],"crowded agents do not roam from an unrelated overflow desk");
});
