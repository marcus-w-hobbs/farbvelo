// import Vue from 'vue';
import {hsluvToHex, hpluvToHex} from 'hsluv';
import chroma from 'chroma-js';
import Seedrandom from 'seedrandom';
import getShareLink from './lib/share-strings';
import spectral from 'spectral.js';
import { logColors, randomStr } from './utils.js';
import generateRandomColors from './lib/generate-random-colors.js';
import { loadImage } from './lib/image-palette.js';
import { buildImage, buildSVG, copyExport, shareURL } from './lib/export-utils.js';

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

const workers = [];
const CANVAS_SCALE = 0.4;

Vue.component('color', {
  props: ['colorhex', 'name', 'colorvaluetype', 'contrastcolor', 'nextcolorhex', 'contrastcolors'],
  template: `<aside @click="copy" class="color" v-bind:style="{'--color': colorhex, '--color-next': nextcolorhex, '--color-text': contrastcolor, '--color-best-contrast': bestContrast}">
              <div class="color__values">
                <var class="color__value" v-html="value"></var>
                <section class="color__contrasts" v-if="hasWCAGColorPairs" aria-label="good contrast colors">
                  <ol>
                    <li v-for="c in contrastcolors" v-if="c" :key="c" :style="{'--paircolor': c}"><var>{{c}}</var></li>
                  </ol>
                </section>
              </div>
              <h3 class="color__name">{{ name && name.name }}</h3>
              <section class="color__info" v-bind:aria-label="'color values for ' + (name && name.name)">
                <ol>
                  <li>{{ valueRGB }}</li>
                  <li>{{ valueHSL }}</li>
                  <li>{{ valueCMYK }}</li>
                </ol>
              </section>
              <h3 class="color__name">{{ name && name.name }}</h3>
              <div class="color__values">
                <var class="color__value" v-html="value"></var>
                <section class="color__contrasts" v-if="hasWCAGColorPairs" aria-label="good contrast colors">
                  <ol>
                    <li v-for="c in contrastcolors" v-if="c" :key="c" :style="{'--paircolor': c}"><var>{{c}}</var></li>
                  </ol>
                </section>
              </div>
            </aside>`,

  methods: {
    copy: function () {
      navigator.clipboard.writeText(`${this.name.name} ・ ${this.valueHEX} ・ ${this.valueRGB} ・ ${this.valueHSL} ・ ${this.valueCMYK} `);
    }
  },
  computed: {
    valueHEX() {
      return this.colorhex;
    },
    valueCMYK() {
      return chroma(this.colorhex).css('cmyk');
    },
    valueRGB() {
      return chroma(this.colorhex).css('rgb');
    },
    valueHSL() {
      return chroma(this.colorhex).css('hsl');
    },
    value() {
      if(this.colorvaluetype === 'hex') {
        return `<span>${this.colorhex}</span>`;
      } else {
        const formatters = {
          'cmyk': () => {
            const letters = 'CMYK'.split('');
            return chroma(this.colorhex).cmyk().map((d,i) =>
              `${letters[i]} <sup>${Math.round(d * 100)}%</sup>`).join(' ');
          },
          'rgb': () => {
            const rgb = chroma(this.colorhex).rgb();
            const letters = 'RGB'.split('');
            return rgb.map((d,i) => `${letters[i]} <sup>${d}</sup>`).join(' ');
          },
          'hsl': () => {
            const hsl = chroma(this.colorhex).hsl();
            hsl.pop(); // Remove alpha
            const letters = 'HSL'.split('');
            return hsl.map((d, i) =>
              `${letters[i]} <sup>${Math.round(d * 1000) / (i ? 10 : 1000)}${i ? '%' : '°'}</sup>`
            ).join(' ');
          }
        };

        return formatters[this.colorvaluetype] ?
          formatters[this.colorvaluetype]() :
          chroma(this.colorhex).css(this.colorvaluetype);
      }
    },
    hasWCAGColorPairs() {
      return this.contrastcolors.filter(c => c !== false);
    },
    bestContrast() {
      return chroma.contrast(this.colorhex, 'black') > chroma.contrast(this.colorhex, 'white') ? 'black' : 'white';
    }
  }
});

const defaultSettings = {
  amount: 6,
  colorsInGradient: 4,
  randomOrder: false,
  hasGradients: true,
  hasBackground: false,
  animateBackgroundIntro: false,
  hasOutlines: false,
  highContrast: false,
  autoHideUI: false,
  expandUI: false,
  hasBleed: false,
  hasGrain: false,
  hideText: false,
  showContrast: false,
  addBWContrast: true,
  padding: 0.175,
  colorMode: "hsluv",
  minHueDistance: 60,
  interpolationColorModel: "lab",
  colorValueType: "hex",
  generatorFunction: "Legacy",
  quantizationMethod: "art-palette",
  nameList: "bestOf",
  showUI: true,
  sameHeightColors: false,
  exportAs: "jsArray",
  imgURL: "",
  imgID: "",
  trackSettingsInURL: true,
};

new Vue({
  el: "#app",
  data: () => {
    return {
      colorsValues: [],
      names: [],
      colorModeList: ["hsluv", "oklch", "hcl", "hsl", "hcg", "hsv", "hpluv"],
      interpolationColorModels: [
        "lab",
        "oklab",
        "spectral",
        "rgb",
        "lrgb",
        "hcl",
        "hsl",
        "hsv",
        "hsi",
        "oklch",
      ],
      colorValueTypes: ["hex", "rgb", "hsl", "cmyk"],
      generatorFunctionList: [
        "Hue Bingo",
        "Legacy",
        "ImageExtract",
        "RandomColor.js",
        "Simplex Noise",
        "Full Random",
      ],
      nameLists: {
        bestOf: {
          title: "Best of Color Names",
          source: "https://github.com/meodai/color-names",
          description: "Best color names selected from various sources.",
          key: "bestOf",
          colorCount: 4541,
          license: "MIT",
          url: "/v1/?list=bestOf",
        },
      },
      quantizationMethods: ["art-palette", "gifenc" /*, 'pigmnts'*/],
      changedNamesOnly: false,
      isLoading: true,
      isAnimating: true,
      currentSeed: randomStr(),
      rnd: new Seedrandom(),
      moveTimer: null,
      isCopiying: false,
      paletteTitle: "Double Rainbow",
      lightmode: false,
      settingsVisible: false,
      shareVisible: false,
      trackSettingsInURL: false,
      trackInURL: [
        { key: "s", prop: "currentSeed" },
        { key: "a", prop: "amount", p: parseInt }, //6
        { key: "cg", prop: "colorsInGradient", p: parseInt }, //4
        { key: "p", prop: "padding", p: parseFloat }, // .175
        { key: "md", prop: "minHueDistance", p: parseInt }, // 60,
        { key: "cm", prop: "interpolationColorModel" }, // 'lab'
        { key: "f", prop: "generatorFunction" }, // 'Legacy'
        { key: "c", prop: "colorMode" }, // 'hsluv'
        { key: "qm", prop: "quantizationMethod" }, // art-palette,
        { key: "ro", prop: "randomOrder", p: Boolean }, // false
      ],
      trackInLocalStorage: [
        { key: "a", prop: "amount", p: parseInt }, //6
        { key: "cg", prop: "colorsInGradient", p: parseInt }, //4
        { key: "hg", prop: "hasGradients", p: Boolean }, // true
        { key: "hb", prop: "hasBackground", p: Boolean }, // false
        { key: "ho", prop: "hasOutlines", p: Boolean }, // false
        { key: "hc", prop: "highContrast", p: Boolean }, // false
        { key: "ht", prop: "hideText", p: Boolean }, // false,
        { key: "b", prop: "hasBleed", p: Boolean }, // false,
        { key: "p", prop: "padding", p: parseFloat }, // .175
        { key: "md", prop: "minHueDistance", p: parseInt }, // 60,
        { key: "cm", prop: "interpolationColorModel" }, // 'lab'
        { key: "f", prop: "generatorFunction" }, // 'Legacy'
        { key: "c", prop: "colorMode" }, // 'hsluv'
        { key: "sc", prop: "showContrast", p: Boolean }, // false
        { key: "bw", prop: "addBWContrast", p: Boolean }, // true
        { key: "ah", prop: "autoHideUI", p: Boolean }, // false
        { key: "iu", prop: "imgURL" }, // ''
        { key: "lm", prop: "lightmode", p: Boolean }, // true
        { key: "sm", prop: "sameHeightColors", p: Boolean }, // false
        { key: "cv", prop: "colorValueType" }, // hex,
        { key: "qm", prop: "quantizationMethod" }, // art-palette,
        { key: "nl", prop: "nameList" }, // nameList,
        { key: "ts", prop: "trackSettingsInURL", p: Boolean }, // false
        { key: "ro", prop: "randomOrder", p: Boolean }, // false
      ],
      ...defaultSettings,
    };
  },
  watch: {
    $data: {
      handler: function (newValue, oldValue) {
        if (this.trackSettingsInURL) {
          console.log("updating URL");
          this.updateURL();
        }
      },
      deep: true,
    },
    mirroredColors: {
      handler: function(newColors) {
        if (this.mirroredNames && this.mirroredNames.length !== newColors.length) {
          console.log("Re-syncing mirrored arrays lengths");
          this.mirroredNames;
          this.mirroredWcagContrastColors;
        }
      },
      deep: false
    },
    trackSettingsInURL: function (newValue, oldValue) {
      if (newValue === false) {
        history.pushState(
          history.state,
          document.title,
          window.location.pathname
        );
      }
      this.trackSettingsInURL = newValue;
    },
    amount: function () {
      this.amount = Math.min(Math.max(this.amount, 3), 10);
      this.colorsInGradient = Math.min(this.colorsInGradient, this.amount);
    },
    colorsInGradient: function () {
      this.colorsInGradient = Math.min(
        Math.max(this.colorsInGradient, 2),
        this.amount
      );
      this.newColors();
    },
    quantizationMethod: function () {
      this.newColors();
    },
    randomOrder: function () {
      this.newColors();
    },
    currentSeed: function () {
      if (this.randomOrder) {
        this.newColors(false);
      }
    },
    minHueDistance: function () {
      this.newColors();
    },
    colorMode: function () {
      this.newColors();
    },
    lightmode: function (newValue) {
      if (newValue) {
        document.querySelector("body").classList.add("lightmode");
      } else {
        document.querySelector("body").classList.remove("lightmode");
      }
      this.updateMeta();
    },
    generatorFunction: function () {
      this.newColors();
      if (this.generatorFunction == "Legacy") {
        console.info(
          "Legacy: Results in mostly vaporwavey color combinations. Old and broken color engine intially used on https://codepen.io/meodai/pen/RerqjG?editors=1100."
        );
      } else if (this.generatorFunction == "Hue Bingo") {
        console.info(
          "Hue Bingo: Selects ℕ0 hue`s (color stops) at a user defined minimum angle ∠, using a controlled random lightness ramp."
        );
      } else if (this.generatorFunction == "Full Random") {
        console.info(
          'Random: Picks ℕ0 random hsl colors. Make sure to use "Mix Padding" with this one.'
        );
      } else if (this.generatorFunction === "RandomColor.js") {
        console.info(
          "RandomColor.js: https://randomcolor.lllllllllllllllll.com/"
        );
      }
    },
    colorsValues: function () {
      this.updateMeta();
    },
    nameList: function () {
      if (this.colorsValues && this.colorsValues.length) {
        this.getNames(this.colors);
      }
    },
  },
  computed: {
    lastColor() {
      return this.colors && this.colors.length
        ? this.colors[this.colors.length - 1]
        : "#212121";
    },
    lastColorContrast() {
      return chroma(this.lastColor).luminance() < 0.5 ? "#fff" : "#212121";
    },
    firstColor() {
      return this.colors && this.colors.length ? this.colors[0] : "#212121";
    },
    firstColorContrast() {
      return chroma(this.firstColor).luminance() < 0.5 ? "#fff" : "#212121";
    },
    mirroredColors() {
      if (!this.colors || !this.colors.length) return [];
      
      const originalColors = this.colors;
      
      if (originalColors.length <= 1) return originalColors;
      
      // Create first mirror (e.g., 1234321)
      const reversedColors = [...originalColors].slice(0, -1).reverse();
      const firstMirror = [...originalColors, ...reversedColors];
      
      // Create second mirror starting from second-to-last element of first mirror
      // This avoids duplicating the turning point (e.g., 123432|123432)
      const secondMirror = firstMirror.slice(0, -1);
      
      return [...firstMirror, ...secondMirror.slice(1)];
    },
    mirroredNames() {
      if (!this.names || !this.names.length) return [];
      
      const originalNames = this.names;
      
      if (originalNames.length <= 1) return originalNames;
      
      // Create first mirror
      const reversedNames = [...originalNames].slice(0, -1).reverse();
      const firstMirror = [...originalNames, ...reversedNames];
      
      // Create second mirror starting from second element to avoid duplication
      const secondMirror = firstMirror.slice(0, -1);
      
      return [...firstMirror, ...secondMirror.slice(1)];
    },
    mirroredWcagContrastColors() {
      if (!this.wcagContrastColors || !this.wcagContrastColors.length) return [];
      
      const originalContrasts = this.wcagContrastColors;
      
      if (originalContrasts.length <= 1) return originalContrasts;
      
      // Create first mirror
      const reversedContrasts = [...originalContrasts].slice(0, -1).reverse();
      const firstMirror = [...originalContrasts, ...reversedContrasts];
      
      // Create second mirror starting from second element to avoid duplication
      const secondMirror = firstMirror.slice(0, -1);
      
      return [...firstMirror, ...secondMirror.slice(1)];
    },
    wcagContrastColors() {
      return this.colors.map((color) =>
        (this.addBWContrast
          ? [...this.colors, "#fff", "#000"]
          : this.colors
        ).map((color2) =>
          4.5 <= chroma.contrast(color, color2) ? color2 : false
        )
      );
    },
    gradientStops() {
      const gradient = [...this.colors];
      gradient[0] += " 12vh";
      gradient[gradient.length - 1] += this.sameHeightColors ? " 80%" : " 69%";
      return gradient.join(",");
    },
    hardStops() {
      return this.colors.map(
          (c, i) =>
            `${c} ${(i / this.colors.length) * 100}% ${
              ((i + 1) / this.colors.length) * 100
            }%`
        )
        .join(",");
    },
    mirroredGradientStops() {
      const gradient = [...this.mirroredColors];
      if (gradient.length < 2) return gradient.join(',');
      
      gradient[0] += " 12vh";
      
      const lastIndex = gradient.length - 1;
      gradient[lastIndex] += this.sameHeightColors ? " 80%" : " 69%";
      
      return gradient.join(",");
    },
    mirroredHardStops() {
      const colors = this.mirroredColors;
      if (colors.length < 2) return "";
      
      return colors.map(
        (c, i) => {
          const start = (i / colors.length) * 100;
          const end = ((i + 1) / colors.length) * 100;
          return `${c} ${start}% ${end}%`;
        }
      ).join(",");
    },
    appStyles() {
      return {
        "--color-first": this.firstColor,
        "--color-last": this.lastColor,
        "--color-last-contrast": this.lastColorContrast,
        "--color-first-contrast": this.firstColorContrast,
        "--colors": this.mirroredColors.length,
        "--gradient": this.mirroredGradientStops, 
        "--gradient-hard": this.mirroredHardStops,
        "--original-gradient": this.gradientStops,
        "--original-gradient-hard": this.hardStops,
      };
    },
    appClasses() {
      return {
        "is-loading": this.isLoading,
        "is-animating": this.isAnimating,
        wrap__hidetext: this.hideText,
        wrap__showcontrast: this.showContrast,
        wrap__hasOutlines: this.hasOutlines,
        wrap__highContrast: this.highContrast,
        wrap__hasGradients: this.hasGradients,
        wrap__showSettings: this.settingsVisible,
        wrap__showShare: this.shareVisible,
        wrap__hasBackground: this.hasBackground,
        wrap__hasBleed: this.hasBleed,
        wrap__hideUI: !this.showUI,
        wrap__expandUI: this.expandUI,
        wrap__hasDithering: this.hasGrain,
        wrap__lightmode: this.lightmode,
        wrap__sameHeightColors: this.sameHeightColors,
      };
    },
    namedColorList() {
      return this.mirroredNames.map((color, index) => {
        const c = chroma(this.mirroredColors[index]);

        return {
          name: color.name,
          value: this.mirroredColors[index],
          values: {
            hex: this.mirroredColors[index],
            rgb: c.css("rgb"),
            hsl: c.css("hsl"),
            cmyk: c.css("cymk"),
          },
        };
      });
    },
    currentListData() {
      return this.nameLists[this.nameList];
    },
    colorList() {
      const namedColors = this.namedColorList.map((color) => ({
        ...color,
        value: color.values[this.colorValueType],
      }));

      if (this.exportAs === "list") {
        return namedColors.map((c) => c.value).join("\n");
      } else if (this.exportAs === "csvList") {
        return `name,value${namedColors.reduce(
          (r, c) => `${r}\n${c.name},${c.value}`,
          ""
        )}\n`;
      } else if (this.exportAs === "jsArray") {
        return `[\n  "${namedColors.map((c) => c.value).join('", \n  "')}"\n]`;
      } else if (this.exportAs === "jsObject") {
        return `{${namedColors.reduce(
          (r, c) => `${r}\n  "${c.name}": "${c.value}",`,
          ""
        )}\n}`;
      } else if (this.exportAs === "css") {
        return `${namedColors.reduce(
          (r, c) =>
            `${r}${r ? `\n` : ""}--${CSS.escape(
              c.name.replace(/ /g, "-")
            ).toLowerCase()}: ${c.value};`,
          ""
        )}`;
      } else if (this.exportAs === "cssGradient") {
        return `linear-gradient(\n  ${namedColors
          .map((c) => c.value)
          .join(", \n  ")}\n);`;
      }
    },
    currentURL() {
      return window.location.origin + "/?s=" + this.constructURL();
    },
    colors() {
      let colors;

      if (
        this.interpolationColorModel === "spectral" &&
        this.colorsValues.length < this.amount
      ) {
        // define the original array of X colors
        const xColors = [...this.colorsValues];

        // define the desired length of the new array
        const yLength = this.amount;

        // calculate the number of gaps between colors
        const numGaps = xColors.length - 1;

        // calculate the spacing between intermediate colors
        const spacing = numGaps > 0 ? (yLength - 2) / numGaps : 0;

        // create the new array of Y colors
        const yColors = new Array(yLength);

        // set the first color in the new array to match X
        yColors[0] = xColors[0];

        // compute the intermediate colors using spectral mixing
        let yIndex = 1;
        for (let i = 0; i < numGaps; i++) {
          const color1 = xColors[i];
          const color2 = xColors[i + 1];
          const gapLength = spacing + 1;
          for (let j = 1; j <= gapLength; j++) {
            const mixRatio = j / gapLength;
            const mixedColor = spectral.mix(color1, color2, mixRatio);
            yColors[yIndex] = mixedColor;
            yIndex++;
          }
        }

        // set the last color in the new array to match X
        yColors[yLength - 1] = xColors[xColors.length - 1];
        colors = chroma
          .scale(yColors)
          .padding(parseFloat(this.padding))
          .colors(this.amount);
      } else {
        colors = chroma
          .scale(
            this.colorsValues.length ? this.colorsValues : ["#202124", "#fff"]
          )
          .padding(parseFloat(this.padding))
          .mode(
            this.interpolationColorModel !== "spectral"
              ? this.interpolationColorModel
              : "lch"
          )
          .colors(this.amount);
      }

      // Only get names for the original colors, not the mirrored ones
      this.getNames(colors);

      logColors(colors);

      return colors;
    },
  },
  methods: {
    random(min = 1, max) {
      if (!max) return this.rnd() * min;
      return Math.floor(this.rnd() * (max - min + 1)) + min;
    },
    getContrastColor(color) {
      const currentColor = chroma(color);
      const lum = currentColor.luminance();
      return lum < 0.15
        ? currentColor.set("hsl.l", "+.25").hex()
        : currentColor.set("hsl.l", "-.35").hex();
    },
    copyExport(e) {
      copyExport({
        exportAs: this.exportAs,
        colorList: this.colorList,
        colors: this.mirroredColors,
        lightmode: this.lightmode,
        buildImageFn: buildImage,
        buildSVGFn: buildSVG,
        setCopying: (val) => {
          this.isCopiying = val;
        },
      });
    },
    shareURL() {
      shareURL(this.currentURL);
    },
    buildImage(size = 100, padding = 0.1, hardStops = false) {
      return buildImage(this.mirroredColors, this.lightmode, size, padding, hardStops);
    },
    buildSVG(size = 100, padding = 0.1, hardStops = false) {
      return buildSVG(this.mirroredColors, size, padding, hardStops);
    },
    getLists() {
      const url = new URL("https://api.color.pizza/v1/lists/");
      return fetch(url, {
        headers: {
          "X-Referrer": "https://farbvelo.elastiq.ch/",
        },
      })
        .then((data) => data.json())
        .then((data) => {
          const listsToKeep = {};
          Object.keys(data.listDescriptions).forEach((key) => {
            if (data.listDescriptions[key].colorCount > 150) {
              listsToKeep[key] = data.listDescriptions[key];
            }
          });
          this.nameLists = listsToKeep;
        });
    },
    getNames(colors, onlyNames) {
      const url = new URL("https://api.color.pizza/v1/");

      const params = {
        noduplicates: true,
        list: this.nameList,
        values: colors.map((c) => c.replace("#", "")),
      };

      url.search = new URLSearchParams(params).toString();

      return fetch(url, {
        headers: {
          "X-Referrer": "https://farbvelo.elastiq.ch/",
        },
      })
        .then((data) => data.json())
        .then((data) => {
          this.names = data.colors;
          this.paletteTitle = data.paletteTitle;
        });
    },
    updateMeta() {
      const theme = document.querySelector('[name="theme-color"]');
      const favicons = document.querySelectorAll('[rel="icon"]');
      theme.setAttribute("content", this.mirroredColors[0]);

      const faviconBase64 = this.buildImage(100, 0.1).toDataURL("image/png");
      favicons.forEach(($icon) => ($icon.href = faviconBase64));
    },
    settingsFromURLAndLocalStorage() {
      const savedSettingsString = localStorage.getItem("farbveloSettings");
      let mergedSettings = {};
      if (savedSettingsString) {
        try {
          const settings = JSON.parse(savedSettingsString);
          this.trackInLocalStorage.forEach((settingConfig) => {
            if (settings.hasOwnProperty(settingConfig.prop)) {
              mergedSettings[settingConfig.prop] = settings[settingConfig.prop];
            }
          });
        } catch (e) {
          console.error("Error loading settings from localStorage:", e);
          localStorage.removeItem("farbveloSettings");
        }
      }

      const params = window.location.search;
      const stateString = new URLSearchParams(params).get("s");
      let hadSettingsFromURL = false;
      if (stateString) {
        try {
          let urlSettings = JSON.parse(
            Buffer.from(stateString, "base64").toString("ascii")
          );
          Object.keys(urlSettings).forEach((settingKey) => {
            const setting = this.trackInURL.find((s) => s.key === settingKey);
            if (setting) {
              mergedSettings[setting.prop] = setting.p
                ? setting.p(urlSettings[settingKey])
                : urlSettings[settingKey];
            }
          });
          this.animateBackgroundIntro = !!urlSettings.hb;
          hadSettingsFromURL = true;
        } catch (e) {
          console.error("Error restoring settings from URL:", e);
        }
      }

      if (typeof mergedSettings.lightmode === 'undefined') {
        const wantLightMode = window.matchMedia("(prefers-color-scheme: light)");
        mergedSettings.lightmode = wantLightMode.matches;
      }

      Object.keys(mergedSettings).forEach((prop) => {
        this[prop] = mergedSettings[prop];
      });

      this.saveSettingsToLocalStorage();

      return hadSettingsFromURL;
    },
    constructURL() {
      const state = this.trackInURL.reduce(
        (o, i) => Object.assign(o, { [i.key]: this[i.prop] }),
        {}
      );
      const serializedState = Buffer.from(JSON.stringify(state)).toString(
        "base64"
      );
      return serializedState;
    },
    updateURL() {
      if (this.trackSettingsInURL) {
        const newURL = "?s=" + this.constructURL();
        if (window.location.search !== newURL) {
          history.pushState(
            { seed: this.currentSeed, settings: this.constructURL() },
            document.title,
            newURL
          );
        }
      }
      this.saveSettingsToLocalStorage();
    },
    newColors(newSeed) {
      document.documentElement.classList.remove("is-imagefetching");
      if (newSeed) {
        this.currentSeed = randomStr();
      }
      this.rnd = new Seedrandom(this.currentSeed);
      this.updateURL();
      if (this.generatorFunction !== "ImageExtract") {
        let colorArr = generateRandomColors({
          generatorFunction: this.generatorFunction,
          random: this.random,
          currentSeed: this.currentSeed,
          colorMode: this.colorMode,
          amount: this.amount,
          parts: this.colorsInGradient,
          randomOrder: this.randomOrder,
          minHueDiffAngle: this.minHueDistance,
        });
        this.colorsValues = colorArr;
      } else if (this.generatorFunction === "ImageExtract") {
        const imgSrc = `https://picsum.photos/seed/${this.currentSeed}/${
          325 * 2
        }/${483 * 2}`;
        this.imgURL = imgSrc;
        loadImage(
          this,
          canvas,
          ctx,
          imgSrc,
          this.colorsInGradient,
          this.quantizationMethod
        );
        this.colorsValues = this.colorsValues;
      }
    },
    resetSettings() {
      Object.keys(defaultSettings).forEach((key) => {
        this[key] = defaultSettings[key];
      });
    },
    toggleSettings() {
      this.shareVisible = false;
      if (!this.settingsVisible) {
        this.$refs.panel.scrollTo(0, 0);
      }
      this.settingsVisible = !this.settingsVisible;
    },
    toggleShare() {
      this.settingsVisible = false;
      if (!this.shareVisible) {
        this.$refs.panel.scrollTo(0, 0);
      }
      this.shareVisible = !this.shareVisible;
    },
    cancelSwipe(e) {
      e.stopPropagation();
    },
    hideTools() {
      this.showUI = true;

      if (this.autoHideUI) {
        clearTimeout(this.moveTimer);
        this.moveTimer = setTimeout(() => {
          this.showUI = false;
        }, 3000);
      }
    },
    addMagicControls() {
      document.addEventListener("keydown", (e) => {
        if (e.metaKey || e.ctrlKey) {
          return;
        }

        if (e.code === "Space") {
          this.newColors(true);
        } else if (e.code === "ArrowRight") {
          this.padding = Math.min(1, this.padding + 0.01);
        } else if (e.code === "ArrowLeft") {
          this.padding = Math.max(0, this.padding - 0.01);
        } else if (e.code === "Escape") {
          if (this.settingsVisible || this.shareVisible) {
            this.settingsVisible = false;
            this.shareVisible = false;
          }
        }
      });

      let isTouching = false;
      let lastX = 0;

      document.addEventListener("pointerdown", (e) => {
        isTouching = true;
        lastX = e.clientX;
        this.hideTools();
      });

      document.addEventListener("pointermove", (e) => {
        this.hideTools();
        if (isTouching) {
          e.preventDefault();
          const direction = Math.sign(e.clientX - lastX);
          let lastPadd = this.padding;
          if (direction == -1) {
            this.padding = Math.max(
              0,
              this.padding - Math.abs(e.clientX - lastX) / window.innerWidth
            );
          } else {
            this.padding = Math.min(
              1,
              this.padding + Math.abs(e.clientX - lastX) / window.innerWidth
            );
          }
          lastX = e.clientX;
        }
      });

      document.addEventListener("pointerup", (e) => {
        isTouching = false;
      });
    },
    handlefile(e) {
      const reader = new FileReader();
      reader.addEventListener("loadend", this.imageLoaded);
      reader.readAsDataURL(e.target.files[0]);
    },
    imageLoaded(event) {
      this.processImageSource(event.target.result);
    },
    processImageSource(src) {
      const srcimg = new Image();
      srcimg.onload = () => {
        this.imgURL = src;
        loadImage(
          this,
          canvas,
          ctx,
          srcimg.src,
          this.colorsInGradient,
          this.quantizationMethod
        );
      };
      srcimg.src = src;
    },
    getShareLink(provider) {
      return getShareLink(provider, this.currentURL, this.paletteTitle);
    },
    saveSettingsToLocalStorage() {
      const settingsToSave = this.trackInLocalStorage.reduce((acc, setting) => {
        acc[setting.prop] = this[setting.prop];
        return acc;
      }, {});
      try {
        localStorage.setItem(
          "farbveloSettings",
          JSON.stringify(settingsToSave)
        );
      } catch (e) {
        console.error("Error saving settings to localStorage:", e);
      }
    },
    loadSettingsFromLocalStorage() {
      const savedSettingsString = localStorage.getItem("farbveloSettings");
      if (savedSettingsString) {
        try {
          const settings = JSON.parse(savedSettingsString);
          let settingsApplied = false;
          this.trackInLocalStorage.forEach((settingConfig) => {
            if (settings.hasOwnProperty(settingConfig.prop)) {
              this[settingConfig.prop] = settings[settingConfig.prop];
              settingsApplied = true;
            }
          });

          if (settingsApplied) {
            if (this.lightmode) {
              document.querySelector("body").classList.add("lightmode");
            } else {
              document.querySelector("body").classList.remove("lightmode");
            }
            this.animateBackgroundIntro = !!this.hasBackground;
            this.updateMeta();
            return true;
          }
        } catch (e) {
          console.error("Error loading settings from localStorage:", e);
          localStorage.removeItem("farbveloSettings");
        }
      }
      return false;
    },
  },
  mounted() {
    this.getLists();
    let hadSettingsFromURL = this.settingsFromURLAndLocalStorage();
    const settingsActuallyLoaded = true;

    if (hadSettingsFromURL && !this.trackSettingsInURL) {
      window.history.replaceState({}, document.title, location.pathname);
    }

    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.seed) {
        this.currentSeed = event.state.seed;

        if (event.state.settings) {
          try {
            let urlSettings = JSON.parse(
              Buffer.from(event.state.settings, 'base64').toString('ascii')
            );

            this.trackInURL.forEach((setting) => {
              if (urlSettings[setting.key]) {
                this[setting.prop] = setting.p
                  ? setting.p(urlSettings[setting.key])
                  : urlSettings[setting.key];
              }
            });

            this.rnd = new Seedrandom(this.currentSeed);
            this.newColors(false);
          } catch (e) {
            console.error('Error restoring settings from history state:', e);
          }
        }
      } else {
        if (!window.location.search) {
          this.resetSettings();
          this.newColors(true);
        }
      }
    });

    if ("ondrop" in window) {
      document.documentElement.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      document.documentElement.addEventListener("dragleave", (e) => {
        e.preventDefault();
      });

      document.documentElement.addEventListener("drop", (e) => {
        const file = e.dataTransfer.files[0];
        if (e.dataTransfer.files.length && file.type.match(/^image\//)) {
          e.preventDefault();
          this.imgURL = " ";
          this.generatorFunction = "ImageExtract";
          const reader = new FileReader();
          reader.addEventListener("loadend", (event) => {
            this.processImageSource(event.target.result);
            setTimeout(() => {
              this.settingsVisible = true;
            }, 500);
          });
          reader.readAsDataURL(file);
        }
      });
    }

    const isPalm = window.matchMedia("(max-width: 850px)");

    if (isPalm.matches) {
      this.expandUI = true;
    }

    const moreContrast = window.matchMedia("(prefers-contrast: more)");

    if (moreContrast.matches && !settingsActuallyLoaded) {
      this.highContrast = true;
      this.hasGradients = false;
    }

    this.newColors(!settingsActuallyLoaded);

    if (!settingsActuallyLoaded) {
      const wantLightMode = window.matchMedia("(prefers-color-scheme: light)");
      if (wantLightMode.matches) {
        this.lightmode = true;
      }
    }

    this.addMagicControls();

    document.querySelector("body").classList.remove("is-loading");

    setTimeout(() => {
      this.isLoading = false;
    }, 100);

    setTimeout(() => {
      this.isAnimating = false;
    }, 1600);

    if (this.animateBackgroundIntro && !settingsActuallyLoaded) {
      setTimeout(() => {
        this.hasBackground = true;
      }, 2000);
    } else if (settingsActuallyLoaded && this.hasBackground) {
    }
  },
});
