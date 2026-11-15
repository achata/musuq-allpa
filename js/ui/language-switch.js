window.LanguageSwitch = class LanguageSwitch {
  constructor(button) {
    this.button = button;
    this.render = this.render.bind(this);
    button.addEventListener('click', () => {
      const list = CampoI18n.catalog._meta.order;
      CampoI18n.setLanguage(list[(list.indexOf(CampoI18n.language) + 1) % list.length]);
    });
    document.addEventListener('campo:language', this.render);
    CampoI18n.ready.then(this.render).catch(() => { button.textContent = 'Español'; button.disabled = true; });
  }
  render() {
    this.button.textContent = CampoI18n.catalog._meta.order.map(code => code === CampoI18n.language ? `[${CampoI18n.catalog[code].lang.code}]` : CampoI18n.catalog[code].lang.code).join(' · ');
    this.button.setAttribute('aria-label', `${CampoI18n.t('controls.lang.hint')}: ${CampoI18n.t('lang.name')}`);
  }
};
