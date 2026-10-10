/* Standalone demo uses actual picker modules; extension mode uses the installed content script. */
(() => {
    const demo = new URLSearchParams(location.search).get('demo') === '1';
    const counts = { window: 0, document: 0, target: 0, iframe: 0 };
    let saved = [];
    const status = document.querySelector('#status');
    const render = () => { status.textContent = `Page activity: ${JSON.stringify(counts)}\nDemo saved selectors: ${JSON.stringify(saved)}\nNested scrollTop: ${document.querySelector('#nested-scroll')?.scrollTop || 0}`; };
    let picker;
    // Construct before adversarial window capture handlers, just as document_start does.
    if (demo) {
        picker = GlassVeilPicker.createPicker({
            window, document, utils: GlassVeilPickerUtils,
            createSelectionState: GlassVeilPickerState.createSelectionState,
            createPickerUI: GlassVeilPickerUI.createPickerUI,
            createPickerInput: GlassVeilPickerInput.createPickerInput,
            analyzeImpact: GlassVeilSelectorImpact.analyzeImpact,
            sameImpact: GlassVeilSelectorImpact.sameImpact,
            generateSelector: GlassVeilSelectorGenerator.createSelectorGenerator({ document, Node, CSS,
                isPickerStateClass: GlassVeilPickerUtils.isPickerStateClass }),
            iconUrl: '/icons/icon-32.png',
            saveSelectors: async selectors => {
                saved = selectors;
                for (const selector of selectors) document.querySelectorAll(selector).forEach(element => { element.style.display = 'none'; });
                render();
            }
        });
        document.querySelector('#mode').textContent = 'Standalone demo: actual picker modules, saves in this tab only. No extension storage or toolbar integration.';
        document.querySelector('#start-demo').hidden = false;
        document.querySelector('#start-demo').addEventListener('click', () => picker.start());
    }
    const pageInteraction = event => !event.composedPath().some(node =>
        node.id === 'glassveil-panel' || node.classList?.contains('fixture-controls'));
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu']) {
        window.addEventListener(type, event => { if (pageInteraction(event)) { counts.window++; render(); } }, true);
        document.addEventListener(type, event => { if (pageInteraction(event)) { counts.document++; render(); } }, true);
        document.querySelectorAll('.target').forEach(element => element.addEventListener(type, () => { counts.target++; render(); }));
    }
    window.addEventListener('message', event => {
        if (['http://127.0.0.1:8765', 'http://127.0.0.1:8766'].includes(event.origin) &&
            [document.querySelector('#same-frame').contentWindow, document.querySelector('#cross-frame').contentWindow].includes(event.source) &&
            event.data?.fixtureFrameEvent) { counts.iframe++; render(); }
    });
    document.querySelector('#reset-counts').addEventListener('click', () => { for (const key of Object.keys(counts)) counts[key] = 0; render(); });
    document.querySelector('#scenario').addEventListener('change', event => {
        document.querySelectorAll('.target').forEach(element => { element.hidden = true; element.style.removeProperty('display'); });
        document.querySelector('.stage-overlay')?.remove();
        document.querySelector('#nested-scroll')?.remove();
        document.querySelector('dialog')?.remove();
        const value = event.target.value;
        const ids = { link: 'fixture-link', button: 'fixture-button', 'same-frame': 'same-frame', 'cross-frame': 'cross-frame' };
        if (ids[value]) document.getElementById(ids[value]).hidden = false;
        if (value === 'overlay') {
            const overlay = document.createElement('div'); overlay.id = 'page-overlay'; overlay.className = 'stage-overlay';
            overlay.textContent = 'Page overlay at maximum z-index'; document.body.appendChild(overlay);
        }
        if (value === 'nested') {
            const scroller = document.createElement('div'); scroller.id = 'nested-scroll';
            scroller.style.cssText = 'position:fixed;inset:200px 24px 140px;overflow:auto;background:#dcfce7;padding:24px;';
            scroller.innerHTML = Array.from({ length: 12 }, (_, index) => `<p id="scroll-row-${index}" style="height:120px">Scroll target ${index + 1}</p>`).join('');
            scroller.addEventListener('scroll', render); document.body.appendChild(scroller);
        }
        if (value === 'dialog') {
            const dialog = document.createElement('dialog'); dialog.id = 'page-dialog';
            dialog.innerHTML = '<button id="dialog-ad" class="target">Ad inside a modal dialog</button>';
            document.body.appendChild(dialog); dialog.showModal();
            if (demo) picker.start();
        }
        for (const key of Object.keys(counts)) counts[key] = 0;
        render();
    });
    render();
})();
