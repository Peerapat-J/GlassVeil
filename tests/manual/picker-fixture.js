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
        const engine = GlassVeilRuleEngine.createRuleEngine({ document, MutationObserver });
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
                engine.apply(selectors, true);
                render();
            }
        });
        document.querySelector('#mode').textContent = 'Standalone demo: actual picker modules, saves in this tab only. USER-origin CSS requires the installed extension.';
        document.querySelector('#start-demo').hidden = false;
        document.querySelector('#start-demo').addEventListener('click', () => picker.start());
    }
    const pageInteraction = event => !event.composedPath().some(node =>
        node.id === 'glassveil-panel' || node.classList?.contains('fixture-controls'));
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu']) {
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
        document.querySelector('#protected-ad')?.remove();
        document.querySelector('#google-anno-sa')?.remove();
        document.querySelector('#root-ad-decoy')?.remove();
        document.querySelector('#nested-scroll')?.remove();
        document.querySelectorAll('dialog').forEach(dialog => dialog.remove());
        const value = event.target.value;
        const ids = { link: 'fixture-link', button: 'fixture-button', 'same-frame': 'same-frame', 'cross-frame': 'cross-frame' };
        if (ids[value]) document.getElementById(ids[value]).hidden = false;
        if (value === 'overlay') {
            const overlay = document.createElement('div'); overlay.id = 'page-overlay'; overlay.className = 'stage-overlay';
            overlay.textContent = 'Page overlay at maximum z-index'; document.body.appendChild(overlay);
        }
        if (value === 'important') {
            const ad = document.createElement('div'); ad.id = 'protected-ad';
            ad.textContent = 'Ad with display / outline reset inline !important';
            ad.style.cssText = 'position:fixed;inset:200px 24px 140px;display:flex!important;outline:none!important;box-shadow:none!important;background:#fff4cc;align-items:center;justify-content:center;cursor:pointer';
            document.body.appendChild(ad);
        }
        if (value === 'root-ad') {
            const decoy = document.createElement('div'); decoy.id = 'root-ad-decoy';
            decoy.hidden = true; decoy.innerHTML = '<span></span><span></span>';
            document.body.prepend(decoy);
            const ad = document.createElement('div'); ad.id = 'google-anno-sa';
            ad.style.cssText = 'position:fixed;inset:200px 24px 140px;padding:24px;border:3px solid #b78600;background:#fff4cc';
            ad.innerHTML = '<span style="display:block!important;outline:none!important;cursor:pointer;height:80%;background:white;padding:16px">Ad interior: select this white area</span><span style="display:block">Separate sibling: should remain visible</span>';
            document.documentElement.append(ad);
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
        if (['stacked-dialogs', 'reversed-dialogs', 'blurred-dialogs'].includes(value)) {
            const older = document.createElement('dialog'); older.id = 'older-dialog';
            older.innerHTML = '<button>Older, inert modal</button>';
            const active = document.createElement('dialog'); active.id = 'active-dialog';
            active.innerHTML = '<button id="stacked-modal-ad" class="target">Ad inside the active modal</button>';
            document.body.append(...(value === 'reversed-dialogs' ? [active, older] : [older, active]));
            older.showModal(); active.showModal();
            if (value === 'blurred-dialogs') document.activeElement.blur();
            if (demo) picker.start();
        }
        for (const key of Object.keys(counts)) counts[key] = 0;
        render();
    });
    document.querySelector('#rewrite-ad').addEventListener('click', () => {
        const ad = document.querySelector('#protected-ad');
        if (ad) {
            const replacement = ad.cloneNode(true);
            replacement.style.setProperty('display', 'flex', 'important');
            ad.replaceWith(replacement);
        }
    });
    render();
})();
