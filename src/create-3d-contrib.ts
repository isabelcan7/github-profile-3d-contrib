import * as d3 from 'd3';
import * as util from './utils';
import * as type from './type';

const ANGLE = 30;

const toEpochDays = (date: Date): number =>
    Math.floor(date.getTime() / (24 * 60 * 60 * 1000));

type PanelType = 'top' | 'left' | 'right';

const addNormalColor = (
    path: d3.Selection<SVGRectElement, unknown, null, unknown>,
    contribLevel: number,
    panel: PanelType,
): void => {
    path.attr('class', `cont-${panel}-${contribLevel}`);
};

const decideSeasonPatternNo = (date: Date): number => {
    const sunday = new Date(date.getTime());
    sunday.setDate(sunday.getDate() - sunday.getDay());

    const month = sunday.getUTCMonth();
    const dayOfMonth = sunday.getUTCDate();

    const diff =
        dayOfMonth <= 7
            ? 0
            : dayOfMonth <= 14
              ? 1
              : dayOfMonth <= 21
                ? 2
                : dayOfMonth <= 28
                  ? 3
                  : 4;

    switch (month + 1) {
        case 9:
            // summer -> autumn = 0-4
            return 0 + diff;
        case 10:
        case 11:
            // autumn = 4
            return 4;
        case 12:
            // autumn -> winter = 5-9
            return 5 + diff;
        case 1:
        case 2:
            // winter = 9
            return 9;
        case 3:
            // winter -> spring = 10-14
            return 10 + diff;
        case 4:
        case 5:
            // spring = 14
            return 14;
        case 6:
            // spring -> summer = 15-19
            return 15 + diff;
        case 7:
        case 8:
        default:
            // summer = 19
            return 19;
    }
};

const addSeasonColor = (
    path: d3.Selection<SVGRectElement, unknown, null, unknown>,
    contribLevel: number,
    panel: PanelType,
    date: Date,
): void => {
    const pattern = decideSeasonPatternNo(date);
    path.attr('class', `cont-${panel}-p${pattern}-${contribLevel}`);
};

const addRainbowColor = (
    path: d3.Selection<SVGRectElement, unknown, null, unknown>,
    contribLevel: number,
    panel: PanelType,
    settings: type.RainbowColorSettings,
    week: number,
): void => {
    const className = `rb-l${contribLevel}-${panel}`;
    const offsetHue = week * settings.hueRatio;
    const normalizedHue = ((offsetHue % 360) + 360) % 360;
    const durationSeconds = parseFloat(settings.duration);
    const delaySeconds = -(normalizedHue / 360) * durationSeconds;

    path.attr('class', className).attr(
        'style',
        `animation-delay:${delaySeconds.toFixed(3)}s`,
    );
};

const addBitmapPattern = (
    path: d3.Selection<SVGRectElement, unknown, null, unknown>,
    contributionLevel: number,
    panel: PanelType,
): void => {
    path.attr('fill', `url(#pattern_${contributionLevel}_${panel})`);
};

const atan = (value: number) => (Math.atan(value) * 360) / 2 / Math.PI;

const addPatternForBitmap = (
    defs: d3.Selection<SVGDefsElement, unknown, null, unknown>,
    panelPattern: type.PanelPattern,
    contributionLevel: number,
    panel: PanelType,
): void => {
    const width = Math.max(1, panelPattern.width);
    const height = Math.max(1, panelPattern.bitmap.length);
    const pattern = defs
        .append('pattern')
        .attr('id', `pattern_${contributionLevel}_${panel}`)
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', width)
        .attr('height', height)
        .attr('patternUnits', 'userSpaceOnUse');
    pattern
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', width)
        .attr('height', height)
        .attr('class', `cont-${panel}-bg-${contributionLevel}`);
    const path = d3.path();
    for (const [y, bitmapValue] of panelPattern.bitmap.entries()) {
        const bitmap =
            typeof bitmapValue === 'string'
                ? parseInt(bitmapValue, 16)
                : bitmapValue;
        for (let x = 0; x < width; x++) {
            if ((bitmap & (1 << (width - x - 1))) !== 0) {
                path.rect(x, y, 1, 1);
            }
        }
    }
    pattern
        .append('path')
        .attr('stroke', 'none')
        .attr('class', `cont-${panel}-fg-${contributionLevel}`)
        .attr('d', path.toString());
};

export const addDefines = (
    svg: d3.Selection<SVGSVGElement, unknown, null, unknown>,
    settings: type.Settings,
): void => {
    if (settings.type === 'bitmap') {
        const defs = svg.append('defs');
        for (const [contribLevel, info] of settings.contribPatterns.entries()) {
            addPatternForBitmap(defs, info.top, contribLevel, 'top');
            addPatternForBitmap(defs, info.left, contribLevel, 'left');
            addPatternForBitmap(defs, info.right, contribLevel, 'right');
        }
    }
};

const treeCrownClass = (
    settings: type.FullSettings,
    contribLevel: number,
    date: Date,
    dark: boolean,
): string => {
    const kind = dark ? 'tree-crown-dark' : 'tree-crown';
    if (settings.type === 'tree_season') {
        return `${kind}-p${decideSeasonPatternNo(date)}-${contribLevel}`;
    }
    return `${kind}-${contribLevel}`;
};

const hashSeed = (date: Date): number => {
    const n = Math.floor(date.getTime() / 86400000);
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
};

const drawTree = (
    bar: d3.Selection<SVGGElement, unknown, null, unknown>,
    settings: type.TreeColorSettings | type.TreeSeasonColorSettings,
    contribLevel: number,
    cal: type.CalendarInfo,
    dx: number,
    calHeight: number,
): void => {
    if (contribLevel === 0) {
        return;
    }

    const date = cal.date;
    const crownClass = treeCrownClass(settings, contribLevel, date, false);
    const shadeClass = treeCrownClass(settings, contribLevel, date, true);

    const seed = hashSeed(date);
    const count = cal.contributionCount;

    // within a level, busier days grow slightly bigger trees
    const busy = Math.min(1, Math.log10(count + 1) / Math.log10(16));
    const sizeJitter = 0.86 + seed * 0.2 + busy * 0.22;
    const leanDir = seed < 0.5 ? -1 : 1;
    const lean = (seed * 2 - 1) * dx * 0.12;

    const cx = dx + lean * 0.4;
    const baseline = calHeight;

    const trunkWidth = dx * (0.26 + seed * 0.1);
    const crownWidth = dx * 1.7 * sizeJitter;
    const maxRadius = crownWidth / 2;

    const crownSpan = Math.max(dx * 1.1, calHeight * 0.78) * sizeJitter;
    const trunkHeight = Math.max(dx * 0.42, calHeight - crownSpan);

    bar.append('rect')
        .attr('x', util.toFixed(cx - trunkWidth / 2))
        .attr('y', util.toFixed(baseline - trunkHeight))
        .attr('width', util.toFixed(trunkWidth))
        .attr('height', util.toFixed(trunkHeight))
        .attr('class', 'tree-trunk');

    const crownBottom = baseline - trunkHeight;

    const shape =
        settings.treeShape === 'mixed'
            ? seed < 0.45
                ? 'pine'
                : 'round'
            : settings.treeShape;

    if (shape === 'round') {
        const r = Math.min(maxRadius, crownSpan / 2);
        const cy = crownBottom - r * 0.82;
        const squash = 0.9 + seed * 0.22;
        const blobs: Array<[number, number, number]> =
            busy > 0.55
                ? [
                      [cx - r * 0.42 * leanDir, cy + r * 0.2, r * 0.72],
                      [cx + r * 0.4 * leanDir, cy + r * 0.05, r * 0.66],
                      [cx + lean, cy - r * 0.34, r * 0.74],
                  ]
                : [[cx + lean, cy, r]];

        blobs.forEach(([bx, by, br]) => {
            bar.append('ellipse')
                .attr('cx', util.toFixed(bx))
                .attr('cy', util.toFixed(by))
                .attr('rx', util.toFixed(br))
                .attr('ry', util.toFixed(br * squash))
                .attr('class', crownClass);
        });
        const [mx, my, mr] = blobs[blobs.length - 1];
        bar.append('path')
            .attr(
                'd',
                `M ${util.toFixed(mx)} ${util.toFixed(my - mr * squash)}` +
                    ` A ${util.toFixed(mr)} ${util.toFixed(
                        mr * squash,
                    )} 0 0 1 ${util.toFixed(mx)} ${util.toFixed(
                        my + mr * squash,
                    )} Z`,
            )
            .attr('class', shadeClass);
        return;
    }

    const tiers = busy > 0.62 ? 4 : busy > 0.25 ? 3 : 2;
    const tierStep = crownSpan / (tiers + 0.6);
    for (let i = 0; i < tiers; i++) {
        const ratio = 1 - (i / tiers) * 0.62;
        const tierBottom = crownBottom - tierStep * i;
        const tierTop = tierBottom - tierStep * 1.75;
        const halfWidth = (crownWidth * ratio) / 2;
        const tipX = cx + lean * (i / tiers);
        bar.append('path')
            .attr(
                'd',
                `M ${util.toFixed(tipX)} ${util.toFixed(tierTop)}` +
                    ` L ${util.toFixed(cx + halfWidth)} ${util.toFixed(tierBottom)}` +
                    ` L ${util.toFixed(cx - halfWidth)} ${util.toFixed(tierBottom)} Z`,
            )
            .attr('class', crownClass);
        bar.append('path')
            .attr(
                'd',
                `M ${util.toFixed(tipX)} ${util.toFixed(tierTop)}` +
                    ` L ${util.toFixed(cx + halfWidth)} ${util.toFixed(tierBottom)}` +
                    ` L ${util.toFixed(cx)} ${util.toFixed(tierBottom)} Z`,
            )
            .attr('class', shadeClass);
    }
};

export const create3DContrib = (
    svg: d3.Selection<SVGSVGElement, unknown, null, unknown>,
    userInfo: type.UserInfo,
    x: number,
    y: number,
    width: number,
    height: number,
    settings: type.FullSettings,
    isForcedAnimation = false,
): void => {
    if (userInfo.contributionCalendar.length === 0) {
        return;
    }

    const firstDate = userInfo.contributionCalendar[0].date;
    const sundayOfFirstWeek = toEpochDays(firstDate) - firstDate.getUTCDay();
    const weekcount = Math.ceil(
        (userInfo.contributionCalendar.length + firstDate.getUTCDay()) / 7.0,
    );
    const dx = width / 64;
    const dy = dx * Math.tan(ANGLE * ((2 * Math.PI) / 360));
    const dxx = dx * 0.9;
    const dyy = dy * 0.9;

    const offsetX = dx * 7;
    const offsetY = height - (weekcount + 7) * dy;

    const group = svg.append('g');

    if (settings.type === 'tree' || settings.type === 'tree_season') {
        const cells = userInfo.contributionCalendar.map((cal) => {
            const week = Math.floor(
                (toEpochDays(cal.date) - sundayOfFirstWeek) / 7,
            );
            const dayOfWeek = cal.date.getUTCDay();
            return {
                x: offsetX + (week - dayOfWeek) * dx + dx,
                y: offsetY + (week + dayOfWeek) * dy,
            };
        });
        const pad = dx * 0.55;
        const path = cells
            .map(
                (c) =>
                    `M ${util.toFixed(c.x)} ${util.toFixed(c.y - dy - pad)}` +
                    ` L ${util.toFixed(c.x + dx + pad)} ${util.toFixed(c.y)}` +
                    ` L ${util.toFixed(c.x)} ${util.toFixed(c.y + dy + pad)}` +
                    ` L ${util.toFixed(c.x - dx - pad)} ${util.toFixed(c.y)} Z`,
            )
            .join(' ');
        group.append('path').attr('d', path).attr('class', 'tree-ground');
    }

    userInfo.contributionCalendar.forEach((cal) => {
        const week = Math.floor(
            (toEpochDays(cal.date) - sundayOfFirstWeek) / 7,
        );
        const dayOfWeek = cal.date.getUTCDay(); // sun = 0, mon = 1, ...

        const baseX = offsetX + (week - dayOfWeek) * dx;
        const baseY = offsetY + (week + dayOfWeek) * dy;
        // ref. https://github.com/yoshi389111/github-profile-3d-contrib/issues/27
        const calHeight = Math.log10(cal.contributionCount / 20 + 1) * 144 + 3;
        const contribLevel = cal.contributionLevel;

        const isAnimate = settings.growingAnimation || isForcedAnimation;

        const bar = group
            .append('g')
            .attr(
                'transform',
                `translate(${util.toFixed(baseX)} ${util.toFixed(
                    baseY - calHeight,
                )})`,
            );
        if (isAnimate && contribLevel !== 0) {
            bar.append('animateTransform')
                .attr('attributeName', 'transform')
                .attr('type', 'translate')
                .attr(
                    'values',
                    `${util.toFixed(baseX)} ${util.toFixed(
                        baseY - 3,
                    )};${util.toFixed(baseX)} ${util.toFixed(
                        baseY - calHeight,
                    )}`,
                )
                .attr('dur', '3s')
                .attr('repeatCount', '1');
        }

        if (settings.type === 'tree' || settings.type === 'tree_season') {
            drawTree(
                bar,
                settings,
                contribLevel,
                cal,
                dx,
                calHeight,
            );
            return;
        }

        const widthTop =
            settings.type === 'bitmap'
                ? Math.max(1, settings.contribPatterns[contribLevel].top.width)
                : dxx;
        const topPanel = bar
            .append('rect')
            .attr('stroke', 'none')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', util.toFixed(widthTop))
            .attr('height', util.toFixed(widthTop))
            .attr(
                'transform',
                `skewY(${-ANGLE}) skewX(${util.toFixed(
                    atan(dxx / 2 / dyy),
                )}) scale(${util.toFixed(dxx / widthTop)} ${util.toFixed(
                    (2 * dyy) / widthTop,
                )})`,
            );

        if (settings.type === 'normal') {
            addNormalColor(topPanel, contribLevel, 'top');
        } else if (settings.type === 'season') {
            addSeasonColor(topPanel, contribLevel, 'top', cal.date);
        } else if (settings.type === 'rainbow') {
            addRainbowColor(topPanel, contribLevel, 'top', settings, week);
        } else if (settings.type === 'bitmap') {
            addBitmapPattern(topPanel, contribLevel, 'top');
        }

        const widthLeft =
            settings.type === 'bitmap'
                ? Math.max(1, settings.contribPatterns[contribLevel].left.width)
                : dxx;
        const scaleLeft = Math.sqrt(dxx ** 2 + dyy ** 2) / widthLeft;
        const heightLeft = calHeight / scaleLeft;
        const leftPanel = bar
            .append('rect')
            .attr('stroke', 'none')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', util.toFixed(widthLeft))
            .attr('height', util.toFixed(heightLeft))
            .attr(
                'transform',
                `skewY(${ANGLE}) scale(${util.toFixed(
                    dxx / widthLeft,
                )} ${util.toFixed(scaleLeft)})`,
            );

        if (settings.type === 'normal') {
            addNormalColor(leftPanel, contribLevel, 'left');
        } else if (settings.type === 'season') {
            addSeasonColor(leftPanel, contribLevel, 'left', cal.date);
        } else if (settings.type === 'rainbow') {
            addRainbowColor(leftPanel, contribLevel, 'left', settings, week);
        } else if (settings.type === 'bitmap') {
            addBitmapPattern(leftPanel, contribLevel, 'left');
        }
        if (isAnimate && contribLevel !== 0) {
            leftPanel
                .append('animate')
                .attr('attributeName', 'height')
                .attr(
                    'values',
                    `${util.toFixed(3 / scaleLeft)};${util.toFixed(heightLeft)}`,
                )
                .attr('dur', '3s')
                .attr('repeatCount', '1');
        }

        const widthRight =
            settings.type === 'bitmap'
                ? Math.max(
                      1,
                      settings.contribPatterns[contribLevel].right.width,
                  )
                : dxx;
        const scaleRight = Math.sqrt(dxx ** 2 + dyy ** 2) / widthRight;
        const heightRight = calHeight / scaleRight;
        const rightPanel = bar
            .append('rect')
            .attr('stroke', 'none')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', util.toFixed(widthRight))
            .attr('height', util.toFixed(heightRight))
            .attr(
                'transform',
                `translate(${util.toFixed(dxx)} ${util.toFixed(
                    dyy,
                )}) skewY(${-ANGLE}) scale(${util.toFixed(
                    dxx / widthRight,
                )} ${util.toFixed(scaleRight)})`,
            );

        if (settings.type === 'normal') {
            addNormalColor(rightPanel, contribLevel, 'right');
        } else if (settings.type === 'season') {
            addSeasonColor(rightPanel, contribLevel, 'right', cal.date);
        } else if (settings.type === 'rainbow') {
            addRainbowColor(rightPanel, contribLevel, 'right', settings, week);
        } else if (settings.type === 'bitmap') {
            addBitmapPattern(rightPanel, contribLevel, 'right');
        }
        if (isAnimate && contribLevel !== 0) {
            rightPanel
                .append('animate')
                .attr('attributeName', 'height')
                .attr(
                    'values',
                    `${util.toFixed(3 / scaleRight)};${util.toFixed(
                        heightRight,
                    )}`,
                )
                .attr('dur', '3s')
                .attr('repeatCount', '1');
        }
    });
};
