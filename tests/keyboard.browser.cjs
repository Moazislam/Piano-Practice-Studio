'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

test('computer keyboard plays both octaves and operates tutorials without stuck notes',async()=>{
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  try {
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/index.html')).href);
    await page.evaluate(()=>{
      window.strikes=[];const original=PianoEngine.prototype.noteOn;
      PianoEngine.prototype.noteOn=function(midi,...args){window.strikes.push(midi);return original.call(this,midi,...args);};
    });
    await page.keyboard.press('Enter');await page.locator('#start').waitFor({state:'hidden',timeout:30000});
    await page.click('#keyboard-focus');
    const lower=['a','w','s','e','d','f','t','g','y','h','u','j','k'];
    const upper=['z','2','x','3','c','v','5','b','6','n','7','m',','];
    for(const [row,start] of [[lower,60],[upper,72]])for(let i=0;i<row.length;i++){
      await page.keyboard.down(row[i]);assert.equal(await page.locator('.piano-key.down .key-note').innerText(),await page.locator(`.piano-key[data-offset="${start+i-60}"] .key-note`).innerText());
      assert.equal(await page.evaluate(()=>window.strikes.at(-1)),start+i);
      await page.keyboard.up(row[i]);assert.equal(await page.locator('.piano-key.down').count(),0);
    }
    await page.keyboard.down('a');await page.keyboard.down('d');await page.keyboard.down('g');
    assert.equal(await page.locator('.piano-key.down').count(),3);
    const before=await page.evaluate(()=>window.strikes.length);await page.keyboard.down('g');assert.equal(await page.evaluate(()=>window.strikes.length),before);
    await page.keyboard.up('a');await page.keyboard.up('d');await page.keyboard.up('g');
    await page.keyboard.down('Space');assert.equal(await page.locator('#sustain').getAttribute('aria-pressed'),'true');
    await page.keyboard.up('Space');assert.equal(await page.locator('#sustain').getAttribute('aria-pressed'),'false');
    // Physical code takes precedence over the current input language's character.
    await page.locator('#keyboard').dispatchEvent('keydown',{key:'ش',code:'KeyA'});assert.equal(await page.evaluate(()=>window.strikes.at(-1)),60);
    await page.locator('#keyboard').dispatchEvent('keyup',{key:'ش',code:'KeyA'});assert.equal(await page.locator('.piano-key.down').count(),0);
    await page.locator('#keyboard').dispatchEvent('keydown',{key:'a',code:'',repeat:false});assert.equal(await page.locator('.piano-key.down').count(),1);
    await page.locator('#keyboard').dispatchEvent('keyup',{key:'a',code:''});
    const count=await page.evaluate(()=>window.strikes.length);await page.locator('#tempo').focus();await page.keyboard.press('a');assert.equal(await page.evaluate(()=>window.strikes.length),count);
    await page.click('#keyboard-focus');await page.keyboard.down('a');await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.piano-key.down').count(),0);assert.equal(await page.locator('#octave').inputValue(),'5');await page.keyboard.up('a');
    await page.keyboard.press('a');assert.equal(await page.evaluate(()=>window.strikes.at(-1)),72);
    await page.keyboard.press('p');assert.match(await page.locator('#lesson-status').innerText(),/Step 1 /);
    await page.keyboard.press('d');assert.match(await page.locator('#lesson-status').innerText(),/Step 2 /);
    await page.keyboard.press('ArrowRight');assert.match(await page.locator('#lesson-status').innerText(),/Step 2 /);
    await page.keyboard.press('ArrowLeft');await page.keyboard.press('d');assert.match(await page.locator('#lesson-status').innerText(),/Step 3 /);
    await page.keyboard.press('Backspace');assert.match(await page.locator('#lesson-status').innerText(),/Step 1 /);
    await page.keyboard.press('r');await page.waitForTimeout(300);assert.equal(await page.locator('#listen').innerText(),'Pause');
    await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#listen').innerText(),'Pause');
    await page.keyboard.press('r');assert.equal(await page.locator('#listen').innerText(),'Resume');
    await page.keyboard.press('Escape');assert.equal(await page.locator('.piano-key.down').count(),0);
    // Space retains native activation on ordinary buttons instead of becoming sustain.
    await page.locator('#learn').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#learn').innerText(),'End tutorial');
    await page.locator('.piano-key[data-offset="0"]').focus();await page.keyboard.down('Enter');assert.equal(await page.locator('.piano-key.down').count(),1);await page.keyboard.up('Enter');assert.equal(await page.locator('.piano-key.down').count(),0);
    await page.click('#keyboard-focus');await page.keyboard.down('a');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.locator('.piano-key.down').count(),0);await page.keyboard.up('a');
    await page.selectOption('#range','88');await page.selectOption('#octave','0');await page.click('#keyboard-focus');
    const floor=await page.evaluate(()=>window.strikes.length);await page.keyboard.press('a');assert.equal(await page.evaluate(()=>window.strikes.length),floor);await page.keyboard.press('h');assert.equal(await page.evaluate(()=>window.strikes.at(-1)),21);
    await page.selectOption('#octave','7');await page.click('#keyboard-focus');const ceiling=await page.evaluate(()=>window.strikes.length);await page.keyboard.press(',');assert.equal(await page.evaluate(()=>window.strikes.length),ceiling);
    // Pointer changes give piano shortcuts back immediately, without an outside click.
    for(const [id,value] of [['range','24'],['octave','4'],['level','intermediate'],['song','canon']]){
      await page.locator('#'+id).focus();await page.locator('#'+id).dispatchEvent('pointerdown',{pointerType:'mouse',button:0});
      await page.selectOption('#'+id,value);assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard');
      await page.keyboard.down('a');assert.equal(await page.locator('.piano-key.down').count(),1);await page.keyboard.up('a');
    }
    await page.click('#volume',{position:{x:40,y:14}});assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard');
    await page.click('#lesson-loop');assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard');
    // Editing stays active until committed; Enter applies the value and resumes notes.
    await page.locator('#tempo').focus();await page.fill('#tempo','135');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'tempo');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#tempo').inputValue(),'135');assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard');
    await page.keyboard.down('a');assert.equal(await page.locator('.piano-key.down').count(),1);await page.keyboard.up('a');
    await page.locator('#tempo').focus();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard');
    // Arrow navigation in a keyboard-focused selector must not lose focus after one option.
    await page.locator('#range').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'range');
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboard');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
