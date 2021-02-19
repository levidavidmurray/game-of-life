import * as PIXI from 'pixi.js';
import { ease } from 'pixi-ease';
import { Assets } from './lib/assets';
import { Colors } from './lib/colors';
import { Config } from './config';
import { drawCell, drawGrid, drawUI, setInput } from './setup-helpers';

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
    background.beginFill(Colors.Background, 1);
    background.drawRect(0, 0, screen().width, screen().height);
    background.endFill();
    app.stage.addChild(background);

    let currentCellMap: number[][] = [];
    let graphicsCellMap: PIXI.Graphics[][] = [];

    let colCount = Math.ceil(screen().width / Config.cellSize);
    let rowCount = Math.ceil(screen().height / Config.cellSize);

    let leftMousePressed = false;
    let rightMousePressed = false;
    let isPaused = true;
    let elapsedMS = 0;

    const initCellMap = () => {
        const container = new PIXI.Container();
        const darkenFilter = new PIXI.filters.ColorMatrixFilter();
        darkenFilter.brightness(0.8, false);

        for (let y = 0; y < rowCount; y++) {
            currentCellMap[y] = [];
            graphicsCellMap[y] = [];

            for (let x = 0; x < colCount; x++) {
                currentCellMap[y].push(0);
                const cell = drawCell(x, y);

                cell.interactive = true;
                cell.alpha = 0;
                cell
                    .on('rightdown', () => cellRightDown(x, y))
                    .on('rightup', (event: MouseEvent) => {
                        rightMousePressed = false;
                        event.preventDefault();
                    })
                    .on('pointerdown', () => cellPointerDown(x, y))
                    .on('pointerup', () => leftMousePressed = false)
                    .on('mouseout', () => {
                        cell.filters = [];
                        if (!isCellAlive(x, y))
                            cell.alpha = 0;
                    })
                    .on('mouseover', () => {
                        if (!isCellAlive(x, y)) {
                            if (leftMousePressed) {
                                createLife(x, y);
                            } else {
                                cell.alpha = 1;
                                cell.filters = [darkenFilter];
                            }
                        } else {
                            if (rightMousePressed) {
                                destroyLife(x, y);
                            }
                        }
                    });

                container.addChild(cell);

                graphicsCellMap[y].push(cell);
            }
        }

        return container;
    }

    function cellRightDown(x: number, y: number) {
        destroyLife(x, y);
        leftMousePressed = false;
        rightMousePressed = true;
    }

    function cellPointerDown(x: number, y: number) {
        createLife(x, y);
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

    function getCellGraphics(x: number, y: number): PIXI.Graphics {
        return graphicsCellMap[y][x];
    }

    function setCellValue(x: number, y: number, value: number) {
        currentCellMap[y][x] = value;
    }

    function createLife(x: number, y: number) {
        setCellValue(x, y, 1);
        getCellGraphics(x, y).alpha = 1;
    }

    function destroyLife(x: number, y: number) {
        setCellValue(x, y, 0);
        getCellGraphics(x, y).alpha = 0;
    }

    function destroyAllLife() {
        isPaused = true;
        for (let y = 0; y < rowCount; y++) {
            for (let x = 0; x < colCount; x++) {
                destroyLife(x, y);
            }
        }
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

        const cellContainer = initCellMap();
        app.stage.addChild(cellContainer);

        // Draw grid lines
        app.stage.addChild(drawGrid(screen(), Config.cellSize));

        // Draw UI
        const {UIContainer, trash, paused} = drawUI(screen());
        trash.on('click', () => {
            destroyAllLife();
            renderPausedUI();
        });

        const renderPausedUI = () => {
            if (isPaused) {
                // background.beginFill(Colors.BackgroundPaused, 1);
                // background.drawRect(0, 0, screen().width, screen().height);
                // background.endFill();
                app.stage.filters = [];
                // gsFilter.greyscale(1, false);
                // cellContainer.filters = [gsFilter]

                paused.visible = true;
                const enter = ease.add(paused, {scale: 0.15, alpha: 1}, {duration: 300, ease: 'easeOutQuad'});
            } else {
                // background.beginFill(Colors.Background, 1);
                // background.drawRect(0, 0, screen().width, screen().height);
                // background.endFill();

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

        app.stage.addChild(UIContainer);

        renderPausedUI();

        app.ticker.add(delta => update(delta));
    }

    function update(delta: number) {
        elapsedMS += app.ticker.elapsedMS;
        if (!isPaused) {

            if (elapsedMS >= Config.updateFrequencyMS) {
                elapsedMS = 0;
                updateLife();
            }
        }
    }

    function updateLife() {
        let lifeCount = 0;
        let deathCount = 0;
        let nextCellMap: number[][] = [];

        for (let y = 0; y < rowCount; y++) {
            if (!nextCellMap[y])
                nextCellMap[y] = [];

            for (let x = 0; x < colCount; x++) {
                const neighbourCount = findNeighbourCount(x, y);
                const currentlyAlive = currentCellMap[y][x] == 1;
                const aliveNext = (neighbourCount == 2 && currentlyAlive) || neighbourCount == 3;
                nextCellMap[y].push(aliveNext ? 1 : 0);
            }
        }

        for (let y = 0; y < rowCount; y++) {
            for (let x = 0; x < colCount; x++) {
                if (nextCellMap[y][x]) {
                    lifeCount++;
                    if (!currentCellMap[y][x]) {
                        createLife(x, y);
                    }
                } else {
                    deathCount++;
                    if (currentCellMap[y][x]) {
                        destroyLife(x, y);
                    }
                }
            }
        }
    }


    // Handle window resizing
    window.addEventListener('resize', (e) => {
        app.renderer.resize(window.innerWidth, window.innerHeight);
    });

    setup();

    document.body.appendChild(app.view);
};

main();
