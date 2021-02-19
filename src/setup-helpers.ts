import * as PIXI from 'pixi.js';
import { ease, Easing } from 'pixi-ease';
import { Assets } from './lib/assets';
import { Config } from './config';
import { Colors } from './lib/colors';

export function drawInstructions(): PIXI.Container {
    const container = new PIXI.Container();

    const spacebarText = new PIXI.Text("Spacebar - Pause/Unpause", {
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 'white',
    });

    const leftClickText = new PIXI.Text("Left Mouse - Draw", {
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 'white',
    });
    leftClickText.y = leftClickText.height + 4;

    const rightClickText = new PIXI.Text("Right Mouse - Erase", {
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 'white',
    });
    rightClickText.y = (rightClickText.height + 4) * 2;

    container.addChild(spacebarText, leftClickText, rightClickText);

    container.x = 16;
    container.y = 80;

    return container;
}

export function drawGrid({width, height}: PIXI.Rectangle, cellSize: number): PIXI.Container {
    const container = new PIXI.Container();

    for (let i = cellSize; i < Math.max(width, height); i += cellSize) {
        // x-axis
        let line = new PIXI.Graphics();
        line.lineStyle(1, Colors.GridLine, 1);
        line.moveTo(0, i);
        line.lineTo(width, i);
        container.addChild(line);

        // y-axis
        line = new PIXI.Graphics();
        line.lineStyle(1, Colors.GridLine, 1);
        line.moveTo(i, 0);
        line.lineTo(i, height);
        container.addChild(line);
    }

    container.alpha = 0.15;
    return container;
}

export function drawUI({width, height}: PIXI.Rectangle): {UIContainer: PIXI.Container, trash: PIXI.Sprite, paused: PIXI.Sprite} {
    const UIContainer = new PIXI.Container();

    const trashTexture = PIXI.Texture.from(Assets.Trash)
    const trashHoverTexture = PIXI.Texture.from(Assets.TrashHover);
    const pausedTexture = PIXI.Texture.from(Assets.Paused);

    // TRASH BUTTON
    const trash = new PIXI.Sprite(trashTexture);
    trash.interactive = true;
    trash.buttonMode = true;

    trash.scale.set(0.15);
    trash.anchor.set(0.5);
    trash.x = width - (trash.width / 2);
    trash.y = height - (trash.height / 2);
    trash.alpha = 0.65;

    let trashOverEase: Easing, trashOutEase: Easing;

    const trashEvents = {
        mouseOver: () => {
            if (trashOutEase)
                trashOutEase.remove(trash);
            trashOverEase = ease.add(trash, {scale: 0.175, alpha: 0.95}, {duration: 700, ease: 'easeOutElastic'});
            trash.texture = trashHoverTexture
        },
        mouseOut: () => {
            if (trashOverEase)
                trashOverEase.remove(trash);
            trashOutEase = ease.add(trash, {scale: 0.15, alpha: 0.65}, {duration: 300, ease: 'easeOutBounce'});
            trash.texture = trashTexture
        },
    };

    trash
        .on('mouseover', trashEvents.mouseOver)
        .on('mouseout', trashEvents.mouseOut);

    UIContainer.addChild(trash);

    // PAUSE INDICATOR
    const paused = new PIXI.Sprite(pausedTexture);
    paused.interactive = true;
    paused.buttonMode = true;

    paused.scale.set(0.15);
    paused.anchor.set(0.5);
    paused.x = 0 + (paused.width / 2);
    paused.y = 0 + (paused.height / 2);
    paused.alpha = 0;
    paused.visible = false;

    UIContainer.addChild(paused, drawInstructions());

    return {
        UIContainer,
        trash,
        paused
    };
}

export function drawCell(x: number, y: number): PIXI.Graphics {
    let cell = new PIXI.Graphics();
    cell.beginFill(Colors.ActiveCell);
    cell.drawRect(gridToPixels(x), gridToPixels(y), Config.cellSize, Config.cellSize);
    cell.endFill();
    return cell;
}

export function gridToPixels(gridIndex: number): number {
    return Config.cellSize * gridIndex;
}

export function setInput(keyCode: number) {
  const key = {
      code: keyCode,
      isDown: false,
      isUp: true,
      press: () => {},
      release: () => {},
      downHandler: (event: KeyboardEvent) => {
        if (event.keyCode === key.code) {
            if (key.isUp) key.press();
            key.isDown = true;
            key.isUp = false;
        }
        event.preventDefault();
      },
      upHandler: (event: KeyboardEvent) => {
        if (event.keyCode === key.code) {
            if (key.isDown) key.release();
            key.isDown = false;
            key.isUp = true;
        }
        event.preventDefault();
      }
  };

  //Attach event listeners
  window.addEventListener("keydown", key.downHandler.bind(key), false);
  window.addEventListener("keyup", key.upHandler.bind(key), false);
  return key;
}