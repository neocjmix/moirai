import { expect, it } from "vitest";
import { compositeStageSpan, resolveCompositeHierarchySpans, compositeLeafChildrenOpacity, advanceCompositeStageSpan, COMPOSITE_PARENT_STAGE_SCALE } from "./composite-visibility-policy";
import { compositeRepresentationDisplay } from "./composite-point-display";
const support = (width:number,height:number) => [{x:0,y:0},{x:width,y:height}];
const opacity = (span:number) => {
  const r=compositeRepresentationDisplay(support(1,1),false,span)!;
  return r.hullOpacity+(1-r.hullOpacity)*r.pointVisibility;
};
it("keeps tall thin regions throughout independent X compression while Y dominates wide flat support",()=>{
  for(const width of [200,100,20,1,0.01]) {
    const span=compositeStageSpan(width,94.4253749);
    expect(span).toBe(94.4253749);
    expect(compositeRepresentationDisplay(support(width,94.4253749))).toMatchObject({hullOpacity:1,hullStrokeOpacity:1,pointOpacity:0});
  }
  expect(compositeStageSpan(60,1)).toBe(12);
  expect(compositeRepresentationDisplay(support(60,1))).toMatchObject({hullOpacity:0,pointOpacity:1});
  expect(compositeRepresentationDisplay(support(1,60))).toMatchObject({hullOpacity:1,pointOpacity:0});
});
it("keeps parents behind children through every stage even when parent published bounds are smaller",()=>{
  for(const zoom of [10,4,2,1,0.6,0.3,0.15,0.1,0.05,0.01]) {
    const spans=resolveCompositeHierarchySpans([
      {id:"root",span:zoom,childIds:["parent","leaf"]},
      {id:"parent",span:zoom*0.5,childIds:["child"]},
      {id:"child",span:zoom*20,childIds:["leaf"]},
    ]);
    const child=spans.get("child")!,parent=spans.get("parent")!,root=spans.get("root")!;
    expect(parent).toBeGreaterThan(child);
    expect(root).toBeGreaterThan(parent);
    expect(parent).toBeCloseTo(child*COMPOSITE_PARENT_STAGE_SCALE);
    if(opacity(child)>0) expect(opacity(parent)).toBeGreaterThan(0);
    if(opacity(parent)>0) expect(opacity(root)).toBeGreaterThan(0);
    if(compositeLeafChildrenOpacity(child)>0) expect(opacity(child)).toBe(1);
  }
  const gap=resolveCompositeHierarchySpans([{id:"parent",span:0,childIds:["child"]},{id:"child",span:0.9,childIds:[]}]);
  expect(opacity(gap.get("child")!)).toBe(0);
  expect(opacity(gap.get("parent")!)).toBeGreaterThan(0);
});
it("uses every authored parent in a DAG, ignores missing children and terminates malformed legacy cycles",()=>{
  const nodes=[{id:"a",span:2,childIds:["child","missing"]},{id:"b",span:4,childIds:["child"]},{id:"child",span:40,childIds:[]}];
  expect(resolveCompositeHierarchySpans(nodes)).toEqual(resolveCompositeHierarchySpans([...nodes].reverse()));
  expect(resolveCompositeHierarchySpans(nodes).get("a")).toBe(54);
  expect(resolveCompositeHierarchySpans(nodes).get("b")).toBe(54);
  const cyclic=resolveCompositeHierarchySpans([{id:"a",span:1,childIds:["b"]},{id:"b",span:2,childIds:["a"]}]);
  expect([...cyclic.values()].every(Number.isFinite)).toBe(true);
});
it("a large camera jump traverses faded hull, large point, small point and hidden without blank coverage",()=>{
  let span=100;
  const visited=new Set<string>();
  for(let frame=0;frame<100;frame++) {
    const next=advanceCompositeStageSpan(span,0.5,16);
    expect(next.span).toBeLessThanOrEqual(span);
    span=next.span;
    const r=compositeRepresentationDisplay(support(1,1),false,span)!;
    if(r.hullOpacity===1&&r.hullStrokeOpacity===0) visited.add("faded-hull");
    if(r.hullOpacity===0&&r.pointScale===1) visited.add("large-point");
    if(r.pointScale<1&&r.pointVisibility>0) visited.add("small-point");
    if(r.pointVisibility===0) visited.add("hidden");
    if(span>3) expect(r.hullOpacity+r.pointOpacity*r.pointVisibility).toBe(1);
    if(!next.active) break;
  }
  expect(span).toBe(0.5);
  expect([...visited]).toEqual(["faded-hull","large-point","small-point","hidden"]);
  expect(advanceCompositeStageSpan(undefined,6,0)).toEqual({span:6,active:false});
});
it("animated hierarchy also retains parent ownership while new children finish an older zoom",()=>{
  let parent=100,child=80;
  for(let frame=0;frame<60;frame++) {
    const a=advanceCompositeStageSpan(parent,0.675,16);
    const b=advanceCompositeStageSpan(child,0.5,16);
    const spans=resolveCompositeHierarchySpans([{id:"parent",span:a.span,childIds:["child"]},{id:"child",span:b.span,childIds:[]}]);
    parent=spans.get("parent")!;child=spans.get("child")!;
    expect(parent).toBeGreaterThan(child);
    if(opacity(child)>0) expect(opacity(parent)).toBeGreaterThan(0);
  }
  expect(parent).toBeCloseTo(0.675);
  expect(child).toBe(0.5);
});
it("respects reduced motion and reverses an in-flight jump without restarting at hidden",()=>{
  expect(advanceCompositeStageSpan(100,6,16,true)).toEqual({span:6,active:false});
  expect(advanceCompositeStageSpan(undefined,100,16)).toEqual({span:100,active:false});
  let span=100;
  for(let frame=0;frame<6;frame++) span=advanceCompositeStageSpan(span,0.5,16).span;
  expect(span).toBeGreaterThan(12);
  const reversed=advanceCompositeStageSpan(span,100,16);
  expect(reversed.span).toBeGreaterThan(span);
  expect(opacity(reversed.span)).toBe(1);
});
it("zero-extent Composite children disappear before every parent instead of remaining opaque forever",()=>{
  for(const parentSpan of [100,20,10,6,3,1,0.5]) {
    const spans=resolveCompositeHierarchySpans([{id:"parent",span:parentSpan,childIds:["zero"]},{id:"zero",span:0,childIds:[]}]);
    const zero=compositeRepresentationDisplay(support(0,0),false,spans.get("zero"))!;
    expect(spans.get("zero")).toBeLessThan(parentSpan);
    if(zero.pointVisibility>0) expect(opacity(parentSpan)).toBeGreaterThan(0);
    if(parentSpan<=1) expect(zero.pointVisibility).toBe(0);
  }
  const chain=resolveCompositeHierarchySpans([{id:"root",span:0,childIds:["middle"]},{id:"middle",span:0,childIds:["child"]},{id:"child",span:0,childIds:[]}]);
  expect(chain.get("root")).toBe(12);
  expect(chain.get("middle")).toBeLessThan(chain.get("root")!);
  expect(chain.get("child")).toBeLessThan(chain.get("middle")!);
  const dag=resolveCompositeHierarchySpans([{id:"a",span:10,childIds:["zero"]},{id:"b",span:0.5,childIds:["zero"]},{id:"zero",span:0,childIds:[]}]);
  expect(opacity(dag.get("zero")!)).toBe(0);
});
