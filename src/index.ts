import * as PIXI from 'pixi.js';
import { ease } from 'pixi-ease';
import { Assets } from './lib/assets';
import { Colors } from './lib/colors';
import { Config } from './config';
import { drawCell, drawGrid, drawUI, gridToPixels, pixelsToGrid, setInput } from './setup-helpers';

const load = (app: PIXI.Application) => {
    return new Promise((resolve) => {
        app.loader
            .add(Assets.Trash)
            .add(Assets.TrashHover)
            .add(Assets.Paused)
            .load(() => resolve(true));
    });
};

const main = async () => {

    // Actual app
    let app = new PIXI.Application();

    app.stage.sortableChildren = true;

    // Display application properly
    document.body.style.margin = '0';
    app.renderer.view.style.position = 'absolute';
    app.renderer.view.style.display = 'block';
    app.renderer.transparent = true;

    // View size = windows
    app.renderer.resize(window.innerWidth, window.innerHeight);

    app.renderer.view.addEventListener('contextmenu', e => {
        e.preventDefault();
    });

    const screen: () => PIXI.Rectangle = () => app.renderer.screen;

    const background = new PIXI.Graphics();
    background.name = "background";
    background.beginFill(Colors.Background, 1);
    background.drawRect(0, 0, screen().width, screen().height);
    background.endFill();
    background.zIndex = -1;
    app.stage.addChild(background);

    let currentX = 0;
    let currentY = 0;

    // Keep track of cells that change, as well as their neighbours so we don't have to iterate every cell in the grid
    let indicesChangedLastStep: {[key: number]: {[key: number]: boolean}} = {};
    // Binary grid values
    let currentCellMap: number[][] = [];
    // index of the PIXI.Graphics object within cellContainer children
    let cellGraphicsIndexMap: {[key: number]: {[key: number]: PIXI.Graphics}} = {};
    // Improve performance by waiting until the mouse is released to add created cells to indicesChangedLastStep
    let pressedCellCache: {[key: number]: {[key: number]: boolean}} = {};

    let cellContainer: PIXI.Container = new PIXI.Container();
    cellContainer.name = "cellContainer";

    let colCount = Math.ceil(screen().width / Config.cellSize);
    let rowCount = Math.ceil(screen().height / Config.cellSize);

    let leftMousePressed = false;
    let rightMousePressed = false;
    let isPaused = true;
    let elapsedMS = 0;
    let currentScale = 1.0;

    const darkenFilter = new PIXI.filters.ColorMatrixFilter();
    darkenFilter.brightness(0.8, false);

    const mouseContainer = new PIXI.Container();
    mouseContainer.name = "mouseContainer";
    mouseContainer.hitArea = new PIXI.Rectangle(0, 0, window.innerWidth, window.innerHeight);
    mouseContainer.zIndex = 0;

    const liveCell = drawCell(0, 0);

    document.addEventListener("contextmenu", (e) => e.preventDefault());

    mouseContainer.interactive = true;

    console.log(screen().width, screen().height);

    // calculate the pixel value from the current scale to what it would have been at a scale of 1
    // pixels = unscaledWidth((scaledPixels - pivot) / scaledWidth) + pivot
    function unscaledPixelValue(scaledPixels: number, unscaledLength: number, scaledLength: number, pivot: number): number {
        if (currentScale === 1) {
            return scaledPixels;
        } else {
            return Math.floor(unscaledLength * ((scaledPixels - pivot) / scaledLength)) + pivot;
        }
    }

    function unscaledCoords(x: number, y: number): number[] {
        const scaledW = Math.floor(screen().width * currentScale), scaledH = Math.floor(screen().height * currentScale);
        const mouse = getMouse();
        
        return [
            unscaledPixelValue(x, screen().width, scaledW, screen().width / 2),
            unscaledPixelValue(y, screen().height, scaledH, screen().height / 2),
        ]
    }

    mouseContainer
    .on('rightdown', (event: PIXI.interaction.InteractionEvent) => {
        const unscaled = unscaledCoords(event.data.global.x, event.data.global.y);
        const gridX = pixelsToGrid(unscaled[0]), gridY = pixelsToGrid(unscaled[1]);
        // console.log(`Right: (px ${event.data.global.x}, py: ${event.data.global.y}, x: ${currentX}, y: ${currentY})`);
        // console.log(`Scaled: (px ${unscaled[0]}, py: ${unscaled[1]}, x: ${gridX}, y: ${gridY})`);
        cellRightDown(gridX, gridY);
    })
    .on('rightup', (event: PIXI.interaction.InteractionEvent) => {
        rightMousePressed = false;
        commitPressedCellCache();
    })
    .on('mousedown', (event: PIXI.interaction.InteractionEvent) => {
        const unscaled = unscaledCoords(event.data.global.x, event.data.global.y);
        const gridX = pixelsToGrid(unscaled[0]), gridY = pixelsToGrid(unscaled[1]);
        // console.log(`Left: (px ${event.data.global.x}, py: ${event.data.global.y}, x: ${currentX}, y: ${currentY})`);
        // console.log(`Scaled: (px ${unscaled[0]}, py: ${unscaled[1]}, x: ${gridX}, y: ${gridY})`);
        cellPointerDown(gridX, gridY);
    })
    .on('mouseup', () => {
        leftMousePressed = false;
        commitPressedCellCache();
    })
    .on('mousemove', (event: PIXI.interaction.InteractionEvent) => {
        const unscaled = unscaledCoords(event.data.global.x, event.data.global.y);
        const gridX = pixelsToGrid(unscaled[0]), gridY = pixelsToGrid(unscaled[1]);
        const newX = gridX;
        const newY = gridY;
        if (currentX !== newX || currentY !== newY) {
            if (leftMousePressed) {
                if (!isCellAlive(newX, newY)) {
                    createLife(newX, newY);
                    addToPressedCellCache(newX, newY);
                }
            } else if (rightMousePressed && isCellAlive(newX, newY)) {
                    destroyLife(newX, newY);
                    addToPressedCellCache(newX, newY);
            }

            currentX = newX;
            currentY = newY;
        }
    });

    function commitPressedCellCache() {
        for (let y in pressedCellCache) {
            for (let x in pressedCellCache[y]) {
                addChangedCells(parseInt(x), parseInt(y));
            }
        }

        pressedCellCache = {};
    }

    function addToPressedCellCache(x: number, y: number) {
        validateRowExists(y);

        pressedCellCache[y][x] = true;
    }

    // @ts-ignore
    window.app = app;

    // @ts-ignore
    window.cells = currentCellMap;
    // @ts-ignore
    window.graphics = cellGraphicsIndexMap;

    function addChangedCells(x: number, y: number) {
        validateRowExists(y);
        const neighbourIndices = findNeighbourIndices(x, y);
        for (let neighbourYS in neighbourIndices) {
            for (let neighbourXS of neighbourIndices[neighbourYS]) {
                const ny = parseInt(neighbourYS);
                validateRowExists(ny)
                indicesChangedLastStep[ny][neighbourXS] = true;
            }
        }
        indicesChangedLastStep[y][x] = true;
    }


    const initCellMap = () => {
        for (let y = 0; y < rowCount; y++) {
            currentCellMap[y] = [];

            for (let x = 0; x < colCount; x++) {
                currentCellMap[y].push(0);
            }
        }
    }

    function cellRightDown(x: number, y: number) {
        console.log(`RIGHT DOWN: isCellAlive(${x}, ${y}) ${isCellAlive(x, y)}`);
        if (isCellAlive(x, y)) {
            addChangedCells(currentX, currentY);
            destroyLife(currentX, currentY);
        }
        leftMousePressed = false;
        rightMousePressed = true;
    }

    function cellPointerDown(x: number, y: number) {
        if (!isCellAlive(x, y)) {
            addChangedCells(x, y);
            createLife(x, y);
        }
        rightMousePressed = false;
        leftMousePressed = true;
    }

    function isCellAlive(x: number, y: number): boolean {
        return getCellValue(x, y) == 1;
    }

    function getCellValue(x: number, y: number): number {
        return currentCellMap[y][x];
    }

    // return 0 if cell is out of bounds, otherwise return cell value
    function getCellValueOr0(x: number, y: number): number {
        return (currentCellMap[y]||[])[x] || 0;
    }

    function setCellGraphics(x: number, y: number, isAlive: boolean) {
        validateRowExists(y);

        if (!isAlive) {
            if (cellGraphicsIndexMap[y][x]) {
                cellGraphicsIndexMap[y][x].destroy({children: true});
                cellContainer.removeChild(cellGraphicsIndexMap[y][x])
                delete cellGraphicsIndexMap[y][x];
            } else {
            }
        } else {
            const cell = new PIXI.Graphics(liveCell.geometry);
            cell.x = gridToPixels(x);
            cell.y = gridToPixels(y);
            cellGraphicsIndexMap[y][x] = cell;
            cellContainer.addChild(cell);
        }
    }

    function validateRowExists(y: number) {
        if (!currentCellMap[y])
            currentCellMap[y] = [];
        if (!pressedCellCache[y])
            pressedCellCache[y] = {};
        if (!cellGraphicsIndexMap[y])
            cellGraphicsIndexMap[y] = {};
        if (!indicesChangedLastStep[y])
            indicesChangedLastStep[y] = {};
    }

    function setCellValue(x: number, y: number, value: number) {
        validateRowExists(y);
        currentCellMap[y][x] = value;
    }

    function createLife(x: number, y: number) {
        setCellValue(x, y, 1);
        setCellGraphics(x, y, true);
    }

    function destroyLife(x: number, y: number) {
        setCellValue(x, y, 0);
        setCellGraphics(x, y, false);
    }

    function destroyAllLife() {
        isPaused = true;
        for (let y = 0; y < rowCount; y++) {
            for (let x = 0; x < colCount; x++) {
                destroyLife(x, y);
            }
        }
    }

    function findNeighbourIndices(x: number, y: number): {[key: number]: number[]} {
        const indices: {[key: number]: number[]} = { [y-1]: [], [y]: [], [y+1]: [] };
        for (let i = 0; i < 3; i++) {
            const nx = (x - 1) + i;
            if (nx < 0 || nx >= colCount)
                continue

            // row above
            let nyAbove = y - 1;
            if (nyAbove >= 0) {
                indices[nyAbove].push(nx)
            }
            // row below
            let nyBelow = y + 1;
            if (nyBelow < rowCount) {
                indices[nyBelow].push(nx)
            }

        }

        // current row
        if (x-1 >= 0) 
            indices[y].push(x-1); // left
        if (x+1 >= 0) 
            indices[y].push(x+1); // right

        return indices;
    }

    function findNeighbourCount(x: number, y: number) {
        let count = 0;

        for (let i = 0; i < 3; i++) {
            const nx = (x - 1) + i; // each neighbour in prev/next row

            if (nx < 0 || nx >= colCount)
                continue;

            // check row above
            let ny = y - 1; // prev row
            count += getCellValueOr0(nx, ny);

            // check row below
            ny = y + 1;
            count += getCellValueOr0(nx, ny);
        }

        // check current row
        count += getCellValueOr0(x-1, y); // left
        count += getCellValueOr0(x+1, y); // right

        return count;
    }

    // Game Logic

    // Load assets
    await load(app);

    function setup() {

        const colorFilter = new PIXI.filters.ColorMatrixFilter();
        const gsFilter = new PIXI.filters.ColorMatrixFilter();
        // @ts-ignore
        window.color = colorFilter;
        // @ts-ignore
        window.gs = gsFilter;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const scalableContainer = new PIXI.Container();
        scalableContainer.name = "scalableContainer";

        initCellMap();
        scalableContainer.addChild(cellContainer);

        // Draw grid lines
        scalableContainer.addChild(drawGrid(screen(), Config.cellSize));

        const left = setInput(37), right = setInput(39);
        const scaleIncrements = 0.2;
        const scaleMin = 1;
        const scaleMax = 3;
        scalableContainer.pivot.set(centerX, centerY);
        scalableContainer.position.set(centerX, centerY);
        scalableContainer.scale.set(scaleMin);
        // @ts-ignore
        window.scalableContainer = scalableContainer;

        window.addEventListener("wheel", (event) => {
            const delta = Math.sign(event.deltaY);

            if (delta < 0) {
                currentScale = Math.min(scaleMax, currentScale + scaleIncrements);
                scalableContainer.scale.set(currentScale);
            } else {
                currentScale = Math.max(scaleMin, currentScale - scaleIncrements)
                scalableContainer.scale.set(currentScale);
            }
        });

        // Draw UI
        const {UIContainer, trash, paused} = drawUI(screen());
        UIContainer.name = "UIContainer";

        trash.on('click', () => {
            destroyAllLife();
            renderPausedUI();
        });

        const renderPausedUI = () => {
            if (isPaused) {
                app.stage.filters = [];
                paused.visible = true;
                ease.add(paused, {scale: 0.15, alpha: 1}, {duration: 300, ease: 'easeOutQuad'});
            } else {
                colorFilter.hue(305, false);
                app.stage.filters = [colorFilter];
                cellContainer.filters = []

                const exit = ease.add(paused, {scale: 0, alpha: 0}, {duration: 300, ease: 'easeInQuad'});
                exit.once('complete', () => paused.visible = false);
            }
        };

        const space = setInput(32);
        space.press = () => {
            isPaused = !isPaused;
            renderPausedUI();
        };

        UIContainer.zIndex = 10;
        scalableContainer.zIndex = -1;
        app.stage.addChild(scalableContainer);
        app.stage.addChild(UIContainer);

        renderPausedUI();

        app.ticker.add(delta => update(delta));
    }

    function getMouse(): PIXI.interaction.InteractionData {
        return app.renderer.plugins.interaction.mouse;
    }

    function update(delta: number) {
        elapsedMS += app.ticker.elapsedMS;
        if (!isPaused) {

            if (elapsedMS >= Config.updateFrequencyMS) {
                elapsedMS = 0;
                updateLifeOptimized();
            }
        }
    }

    // @ts-ignore
    window.indicesChangedLastStep = () => indicesChangedLastStep; // TODO: REMOVE

    // only update the cells that were updated or whose neighbours were updated last generation
    function updateLifeOptimized() {
        const indicesChangedThisStep: {[key: number]: {[key: number]: boolean}} = {};
        const nextCellMap: number[][] = [];
        currentCellMap.forEach((row) => nextCellMap.push(row.slice(0)));

        for (let ys in indicesChangedLastStep) {
            const y = parseInt(ys, 10);

            for (let xs in indicesChangedLastStep[ys]) {
                // we know currentCellMap[y][x] was updated last generation
                // if it changes this generation, add to indicesChangedThisStep
                const x = parseInt(xs, 10);
                const neighbourCount = findNeighbourCount(x, y);
                const currentlyAlive = currentCellMap[y][x] == 1;
                const aliveNext = (neighbourCount == 2 && currentlyAlive) || neighbourCount == 3;
                const willChange = (currentlyAlive && !aliveNext) || (!currentlyAlive && aliveNext);

                // if changing this step, add all neighbours to indicesChangedThisStep
                if (willChange || currentlyAlive) {
                    const neighbourIndices = findNeighbourIndices(x, y);
                    for (let neighbourYS in neighbourIndices) {
                        for (let neighbourXS of neighbourIndices[neighbourYS]) {
                            if (!indicesChangedThisStep[neighbourYS])
                                indicesChangedThisStep[neighbourYS] = {};
                            indicesChangedThisStep[neighbourYS][neighbourXS] = true;
                        }
                    }

                    // add to indicesChangedThisStep
                    indicesChangedThisStep[y][x] = true;
                    nextCellMap[y][x] = aliveNext ? 1 : 0;
                }

            }
        }

        for (let ys in indicesChangedThisStep) {
            const y = parseInt(ys, 10);

            for (let xs in indicesChangedThisStep[ys]) {
                const x = parseInt(xs, 10);
                try {
                    if (nextCellMap[y][x]) {
                        if (!isCellAlive(x, y)) {
                            createLife(x, y);
                        }
                    } else {
                        if (isCellAlive(x, y)) {
                            destroyLife(x, y);
                        }
                    }
                } catch (error) {
                    console.error(`Error creating or destroying cell: (${x}, ${y})`, error);
                }
            }
        }

        indicesChangedLastStep = indicesChangedThisStep;
    }

    // Handle window resizing
    window.addEventListener('resize', (e) => {
        app.renderer.resize(window.innerWidth, window.innerHeight);
    });

    setup();

    app.stage.addChild(mouseContainer);

    document.body.appendChild(app.view);
};

main();
