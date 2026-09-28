import Phaser from "phaser";
import { FONT_FAMILY } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { bus, progression, requests } from "../game/services";
import { habitatFor, type RestorationResource } from "../data/habitats";
import { RESOURCES } from "../data/resources";
import { silhouetteTextureKey } from "../world/silhouette";
import { sparkleBurst } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";

function shortName(full: string): string {
  return full.split(" ")[0];
}

/**
 * The habitat-restoration screen: restore all 3 of an animal's damaged world
 * sources here (each card drives ONE world object — see GardenScene's
 * buildResource/restoreResourceSource) to earn that animal's rescue puzzle.
 * Reachable before rescue (the primary case: silhouette + 3 damaged sources)
 * and, defensively, after (nothing left to do there but view it).
 */
export class HabitatRequestScene extends Phaser.Scene {
  private objectId!: string;
  private root!: Phaser.GameObjects.Container;
  private cards!: Phaser.GameObjects.Container;
  private message!: Phaser.GameObjects.Text;
  private helpBtn!: Button;
  private closing = false;
  private completing = false;
  constructor() { super("HabitatRequest"); }
  init(data: { objectId: string }): void {
    this.objectId = data.objectId;
    this.closing = this.completing = false;
  }
  create(): void {
    const habitat = habitatFor(this.objectId);
    const def = progression.def(this.objectId);
    if (!habitat || !def) { this.close(); return; }
    const rescued = progression.isUnlocked(this.objectId);
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x252b20, 0.68).setOrigin(0).setInteractive();
    this.root = this.add.container(this.scale.width / 2, this.scale.height / 2);
    // One logical composition, scaled as a whole on narrow or short screens.
    this.root.setScale(Math.min(1, (this.scale.width - 28) / 640, (this.scale.height - 32) / 700));
    const wood = makePanel(this, 620, 500, { radius: 38, fill: 0xb47b48, edge: 0x754b2e });
    wood.setY(80); this.root.add(wood);
    const paper = makePanel(this, 596, 476, { radius: 30, fill: 0xfff3dc, edge: 0xe6c392 });
    paper.setY(77); this.root.add(paper);
    // Locked: the same dark silhouette shown in the world (no spoiler of the
    // real art before the puzzle). Rescued: the real production animal.
    const heroKey = rescued ? def.garden_sprite : silhouetteTextureKey(this, def.garden_sprite);
    const hero = this.add.image(0, -156, heroKey).setOrigin(0.5, 1);
    hero.setScale(205 / hero.height); this.root.add(hero);
    this.tweens.add({ targets: hero, angle: { from: -2, to: 2 }, duration: 2100, yoyo: true, repeat: -1 });
    for (const [x,y,flip] of [[-228,-153,false],[228,-153,true]] as const) {
      const flowers = this.add.image(x,y,"dg_flowers_yellow_01").setDisplaySize(103,82).setFlipX(flip);
      this.root.add(flowers);
    }
    this.label(0,-108,"A friend needs help!",34,true);
    this.label(0,-65,`This little ${this.objectId === "rabbit" ? "bunny" : this.objectId} is looking for these items:`,20);
    this.cards = this.add.container(0,0); this.root.add(this.cards);
    this.message = this.label(0,227,"Choose an item to help your friend’s home bloom.",17);
    this.root.add(new Button(this,-145,282,{width:245,height:55,label:"Maybe later",variant:"cream",fontSize:24,onClick:()=>this.close()}));
    this.helpBtn = new Button(this,145,282,{width:245,height:55,label:"Help now",fontSize:24,onClick:()=>this.onHelpNow()});
    this.root.add(this.helpBtn);
    this.rebuild();
    this.updateReadyState();
    const off = bus.on("resource:collected",()=>this.rebuild());
    this.scale.on(Phaser.Scale.Events.RESIZE,this.resize,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{off();this.scale.off(Phaser.Scale.Events.RESIZE,this.resize,this);});
    this.root.setAlpha(0); this.tweens.add({targets:this.root,alpha:1,duration:240});
  }
  private onHelpNow(): void {
    if (progression.isUnlocked(this.objectId)) { this.close(); return; }
    const habitat = habitatFor(this.objectId)!;
    const next = habitat.resources.find(r=>!requests.isSourceRestored(r.id));
    if (!next) {
      // all 3 restored — this IS the rescue trigger
      bus.emit("puzzle:start", { objectId: this.objectId });
      this.close();
      return;
    }
    if (requests.canRestoreSource(next)) this.message.setText("Your materials are ready. Choose Restore on a card.");
    else this.getResource(next);
  }
  private resize(): void { this.scene.restart({objectId:this.objectId}); }
  private label(x:number,y:number,text:string,size:number,bold=false): Phaser.GameObjects.Text {
    const t=this.add.text(x,y,text,{fontFamily:FONT_FAMILY,fontSize:`${size}px`,fontStyle:bold?"700":"500",color:"#70482e",align:"center",wordWrap:{width:555}}).setOrigin(0.5);
    this.root.add(t); return t;
  }
  private rebuild(): void {
    this.cards.removeAll(true);
    habitatFor(this.objectId)!.resources.forEach((res,i)=>{
      const c=this.add.container((i-1)*185,83); this.cards.add(c);
      const restored=requests.isSourceRestored(res.id);
      const ready=requests.canRestoreSource(res);
      const item=RESOURCES[res.produces];
      c.add(makePanel(this,168,244,{radius:25,fill:restored?0xedf2d9:0xf8e7ca,edge:0xe8cda6}));
      const art=this.add.image(0,-46,`dg_${res.restoredAsset}`);
      art.setScale(Math.min(145/art.width,112/art.height)); c.add(art);
      c.add(this.add.text(0,21,item.label,{fontFamily:FONT_FAMILY,fontSize:"20px",fontStyle:"700",color:"#70482e",align:"center",wordWrap:{width:156}}).setOrigin(0.5));
      const count=makePanel(this,142,37,{radius:18,fill:0xfff8e9,shadow:false,edge:0xf4dfbd});count.setY(65);c.add(count);
      c.add(this.add.text(0,65,restored?"Restored ✓":`${Math.min(requests.resourceCount(res.produces),res.restoreCost)} / ${res.restoreCost}`,{fontFamily:FONT_FAMILY,fontSize:"25px",fontStyle:"700",color:ready||restored?"#507539":"#70482e"}).setOrigin(0.5));
      if (!restored) c.add(new Button(this,0,105,{width:138,height:34,label:ready?"Restore":"Get / Play",fontSize:19,variant:ready?"gold":"cream",onClick:()=>ready?this.restore(res):this.getResource(res)}));
    });
  }
  private getResource(res:RestorationResource): void {
    const amount = Math.max(0, res.restoreCost - requests.resourceCount(res.produces));
    if (amount <= 0) { this.rebuild(); this.updateReadyState(); return; }
    // GardenScene's bus listener launches the Garden Maze intro card with this
    // context; the maze returns collected resources through collectResource
    // and reopens this same Request screen (see GardenMazeScene.finishAndReturn).
    const payload = { objectId: this.objectId, sourceId: res.id, resourceId: res.produces, amount };
    this.close();
    bus.emit("resourceAcquisition:open", payload);
  }
  /**
   * Restore is explicit and ONE resource at a time — after this fires, we
   * close the panel (a brief celebratory beat first) so the player watches
   * the actual world object transform, unobstructed, rather than seeing it
   * happen behind the panel. They tap the animal again for the next one.
   */
  private restore(res:RestorationResource): void {
    if (this.completing || !requests.restoreSourceNow(res).ok) return;
    this.completing = true;
    this.rebuild();
    Sfx.bloomChime();
    sparkleBurst(this,this.scale.width/2,this.scale.height/2,22,85);
    const habitat=habitatFor(this.objectId)!;
    if (habitat.resources.every(r=>requests.isSourceRestored(r.id))) {
      this.message.setText(`${habitat.name} is ready to bloom!`).setColor("#507539");
      this.tweens.add({targets:this.root,angle:{from:-1,to:1},duration:180,yoyo:true,repeat:2});
    }
    this.time.delayedCall(650,()=>this.close());
  }
  /** All 3 sources restored, but the puzzle/rescue hasn't happened yet — the
   *  moment this screen exists to build toward. Reflects it in the message +
   *  the primary button, without auto-closing: the player presses to proceed. */
  private updateReadyState(): void {
    if (progression.isUnlocked(this.objectId) || this.completing) return;
    const habitat = habitatFor(this.objectId)!;
    const def = progression.def(this.objectId)!;
    const ready = habitat.resources.every(r=>requests.isSourceRestored(r.id));
    if (ready) {
      this.message.setText(`The garden is ready! Bring ${shortName(def.name)} home.`).setColor("#507539");
      this.helpBtn.setLabel(`Bring ${shortName(def.name)} Home`);
      this.helpBtn.startPulse();
    } else {
      this.message.setText("Choose an item to help your friend’s home bloom.").setColor("#70482e");
      this.helpBtn.setLabel("Help now");
      this.helpBtn.stopPulse();
    }
  }
  private close():void {
    if(this.closing)return;this.closing=true;
    bus.emit("habitatRequest:closed",{objectId:this.objectId});
    if(this.scene.isPaused("Garden"))this.scene.resume("Garden");
    this.scene.stop();
  }
}
