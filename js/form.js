/* global Mustache, Element */
"use strict";
/**
 * 
 * @author grand_wexford
 * @version 0.0.12
 * @description Form Generator
 * @deprecated Описание устарело. Многие поля не описаны.
 * 
 * Принцип работы:
 * - Создаёт форму на основе файла form.json.
 * - Проверяет обязательные поля на заполненность и поле email на корректность.
 * - Отслеживает изменение значений элементов input и отправляет данные на сервер.
 * - Не отправляет изменение поля с типом email, если поле заполненно некорректно.
 * - Не отправляет поле, если следующим событием будет отправка формы.
 * - При подтверждении формы, отправляет данные на сервер.
 * ##- Отображает сообщение полученное с сервера (формат не утверждён)
 * ##- #Подсвечивает поля, если в ответе сервера они значатся ошибочными
 * 
 * Описание структуры *.json
 * form(object): Основные данные формы.
 * - title(): Заголовок формы
 * - button(object): Кнопка под всей формой (пока это всегда кнопка сохранения, но в дальнейшем можно сделать здесь массив кнопок)
 * - - title(string): Текст на кнопке.
 * - - saveUrl(string): Путь для сохранения формы.
 * - - action(string): Событие по этому действию должно быть описано в коде (либо нужно убрать параметр, если он всегда будет одинаковый).
 * - steps(array): Шаги формы (если форма не имеет шагов, заполняется только один элемент массива steps).
 * - - name(string): Название шага (в табе).
 * - - title(string): Заголовок шага.
 * - - grid(string): Какая сетка используется (2, 3, 5, 24)
 * -  - button(object): Кнопка под формой шага
 * - - - title(string): Текст на кнопке.
 * - - - saveUrl(string): Путь для сохранения формы шага.
 * - - - action(string): Событие по этому действию должно быть описано в коде.
 * - - rows(array): Строки формы. Позволяет компоновать поля на одной строке. На самом деле избыточен, нужен только для удобства формирования json.
 * - - - fields(array): Перечень полей данной строки.
 * - - - - name(string): Идентификатор поля.
 * - - - - title(string): Название поля.
 * - - - - type(string): Тип поля.
 * - - - - col(string): Сколько колонок текущей сетки занимает.
 * - - - - required(boolean): Обязательное поле. Заполненность проверяется браузером (атрибут required), затем данным модулем, на случай если браузер не поддерживает.
 
 * 
 * Типы (type) полей:
 * text: стандартное поле ввода
 * tel: номер телефона
 * email: адрес электронной почты (поле с таким типом будет проверено на валидность сначала браузером, затем данным модулем, на случай если браузер не поддерживает.
 * 
 */
var formGenerator = (function () {
	return {
		_$el: {
			'formHolder': document.getElementById('formGen') // слой клиента, куда генерируем страницу
		},
		_txt: {
			'errors': {
				'required': 'Обязательно для заполнения',
				'incorrectEmail': 'Введите корректный адрес'
			}
		},
		_urls: {
//			'json': "stat/form-simple.json" // простая форма
//			'json': "stat/form-tabs-one-form.json" // табы - одна форма
//			'json': "stat/form-tabs.json" // табы - форма на каждом табе
//			'json': "stat/form-wizard.json" // визард
			'json': "stat/form.json" // визард
		},
		_tplLoaded: 0, // 
		_tplsToLoad: ['page', 'row', 'button'], // используемые шаблоны
		_tpls: {}, // сами шаблоны (собираются функцие loadTemplates)
		_$formDOM: null, // @todo можно переиграть и сначала собрать всю форму, а в конце добавить в formHolder
		_currentStep: 0, // номер текущего шага
		_formJSON: {}, // данные о форме, полученные с сервера
		_stepData: {}, // данные о текущем шаге формы
		_isWizard: false, // визард или нет. Определяется по первому клику по кнопке go (сомнительно)
		_timerChange: null, // таймер между изменением поля и отправкой данных. Необходимо, чтобы успеть проверить кликнул ли пользователь на кнопку сохранения сразу после изменения поля.

		/**
		 * Запуск приложения
		 * @returns {undefined}
		 */
		init: function () {
			this._$el.formHolder.addEventListener('change', this.onChangeField.bind(this));
			this._$el.formHolder.addEventListener('click', this.onClick.bind(this));
			document.addEventListener('keypress', this.onKeyup.bind(this));

			this.loadCSS();
			this.loadTemplates();
		},

		/**
		 * При успешном получении json-данных формы
		 * @param {object} data
		 * @returns {undefined}
		 */
		render: function () {
			this.request({
				url: this._urls.json,
				success: this.onFormLoadSuccess,
				dataType: "json"
			});
		},

		/**
		 * При успешном получении json-данных формы
		 * @param {object} data
		 * @returns {undefined}
		 */
		onFormLoadSuccess: function (data) {
			this._formJSON = data.form;
			this._formConfig = data.config;
			this.renderPage();
		},

		/**
		 * Переключение табов
		 * @param {object} event
		 */
		switchTab: function (event) {
			if (event && event.target.hasAttribute('data-tab-index') && event.target.getAttribute('data-tab-index') !== this._currentStep) {
				this._currentStep = event.target.getAttribute('data-tab-index');
			}
		},

		/**
		 * Получить следующее поле для фокуса
		 * @param {object} event
		 */
		getNextField: function (event) {
			var $currentActive = document.activeElement;
			var currentActiveIndex = null;
			var $currentForm = this._$el.formHolder.querySelector("#tForm" + this._currentStep);
			var currentFormData = this.getFormData($currentForm);
			var nextActiveIndex = 0;
			var nextActiveId;
			var $nextActive;
			var $saveButton;
			var availableFormData = [];

			for (var i = 0; i < currentFormData.length; i++) {
				if (!currentFormData[i].disabled && !currentFormData[i].value) {
					availableFormData.push(currentFormData[i]);
				}
			}

			if (availableFormData.length === 0) {
				if (event.keyCode === 13 /* enter */) {
					event.preventDefault();
					$saveButton = $currentForm.querySelector("[data-action=save]");

					if ($saveButton === null) {
						$saveButton = this._$el.formHolder.querySelector("[data-action=save]");
					}

					$saveButton.click();
				}
				return false;
			}

			event.preventDefault();

			for (var i = 0; i < availableFormData.length; i++) {
				if (availableFormData[i].name === $currentActive.name) {
					currentActiveIndex = i;
				}
			}

			if (currentActiveIndex >= availableFormData.length - 1) {
				nextActiveIndex = 0;
			} else {
				nextActiveIndex = currentActiveIndex === null ? 0 : currentActiveIndex + 1;
			}

			nextActiveId = availableFormData[nextActiveIndex].name;
//			$nextActive = document.getElementsByName(nextActiveId);
			$nextActive = this._$el.formHolder.querySelector("[name=" + nextActiveId + "]");

			if ($nextActive === null) {
				$nextActive = document.querySelector("[name=" + availableFormData[0].name + "]");
			}

			this.c(currentActiveIndex, 'currentActiveIndex');
			this.c($currentActive, '$currentActive');
			this.c(currentFormData, 'currentFormData');

			this.c(availableFormData, 'availableFormData');

			this.c(nextActiveIndex, 'nextActiveIndex');
			this.c(nextActiveId, 'nextActiveId');
			this.c($nextActive, '$nextActive');

			$nextActive.focus();
		},

		/**
		 * При нажатии на клавишу
		 * @param {object} event
		 * @returns {boolean}
		 */
		onKeyup: function (event) {
			var $nextField;

			if (event.keyCode === 9 /* tab */ || event.keyCode === 13 /* enter */) {
				$nextField = this.getNextField(event);
			}
		},

		/**
		 * При клике
		 * @param {object} event
		 * @returns {boolean}
		 */
		onClick: function (event) {
			if (event && event.target) {

				this.switchTab(event);

				switch (event.target.getAttribute('data-action')) {
					case 'save':
						clearTimeout(this._timerChange);
						this.saveForm(event);
						break;

					case 'go':
						this._isWizard = true;
						clearTimeout(this._timerChange);
						this.saveForm(event);
						break;

					case 'back':
						if (this._currentStep > 0) {
							var $prevTab = this._$el.formHolder.querySelector("[data-tab-index='" + (this._currentStep - 1) + "']");

							if ($prevTab) {
								$prevTab.click();
							}
						}
						break;
				}
			}
		},

		/**
		 * Сохранение данных формы
		 * @param {object} event
		 * @todo Оптимизировать. getFormData вызывается дважды.
		 * @returns {boolean}
		 */
		saveForm: function (event) {
			var name;
			var url = "";
			var $form = event.target.closest('form');

			if (event.type === "change") {
				name = event.target.name;
			}

			// Кнопка вне формы, значит берём все формы
			if ($form === null) {
				if (this._isWizard) {
					$form = this._$el.formHolder.querySelector('#tForm' + this._currentStep);
					console.log($form);
					url = this._formJSON.saveUrl;
				} else {
					$form = this._$el.formHolder.querySelectorAll('form');
					url = this._formJSON.saveUrl;
				}
			} else {
				url = this._formJSON.steps[this._currentStep].saveUrl;
			}

			if (this.isFormValid($form, name)) {
				if (this._isWizard && !name) {
					if (this._currentStep >= this._formJSON.steps.length - 1) {
						this.request({
							method: "POST",
							data: {data: this.getFormData($form, name)},
							url: url
						});

					} else {
						var $nextTab = this._$el.formHolder.querySelector("[data-tab-index='" + (this._currentStep + 1) + "']");

						if ($nextTab) {
							$nextTab.click();
						}
					}

				} else {
					this.request({
						method: "POST",
						data: {data: this.getFormData($form, name)},
						url: url
					});
				}
				return true;
			} else {
				console.log("Incorrect data");
				return false;
			}
		},

		/**
		 * При изменении данных формы
		 * @param {event} event
		 * @description Сохраняет поле при изменении. Таймер нужен для избежания ситуации, когда сразу после изменения поля происходит сохранение всей формы. В этом случае, таймер сбрасывается и лишнего события не происходит. 
		 * @returns {boolean}
		 */
		onChangeField: function (event) {
			var self = this;
			if (!this.hasClass(event.target, 'nocheck')) {
				this._timerChange = setTimeout(function () {
					self.saveForm(event);
				}, 200);
			}
		},

		/**
		 * Валидация поля
		 * @param {object} fieldData
		 * @returns {boolean}
		 */
		checkField: function (fieldData) {
			var error = null;

			if (fieldData.required && (!fieldData.value || fieldData.value === "")) {
				error = 'required';
			} else if (fieldData.type === 'email' && fieldData.value !== "" && !this.isEmailValid(fieldData.value)) {
				error = 'incorrectEmail';
			}

			return error;
		},

		/**
		 * Валидация данных формы
		 * @param {object|array} $form Форма для проверки.
		 * @param {string} name Поле для проверки. Если неуказано, проверяется всё форма
		 * @returns {boolean}
		 */
		isFormValid: function ($form, name) {
			var formData = [];
			var checkResult = true;
			var error = null;

			if (!$form) {
				return false;
			}

			formData = this.getFormData($form, name);

			for (var i = 0; i < formData.length; i++) {
				error = this.checkField(formData[i]);

				if (error !== null) {
					checkResult = false;
				}
				this.markField(formData[i].name, error);
			}
			return checkResult;
		},

		/**
		 * Пометить поля
		 * @param {string} name Имя поля
		 * @param {string|null} error Код ошибки
		 * @todo Убрать if (! предварительно выяснив почему они могут быть !. Лишнего сюда попадать не должно.
		 * @returns {undefined}
		 */
		markField: function (name, error) {
			var $field;
			var $parent;
			var $errorHolder;

			if (!name) {
				return false;
			}

			$field = this._$el.formHolder.querySelector("[name=" + name + "]");

			if (!$field) {
				return false;
			}

			$parent = $field.closest(".row");

			if (!$parent) {
				return false;
			}

			if (error === null) {
				$parent.classList.remove("error");
				return;
			}

			$parent.classList.add("error");
			$errorHolder = $parent.querySelector('.error-message');

			$errorHolder.innerHTML = this._txt.errors[error];
		},

		/**
		 * Создание DOM-элемента по шаблону
		 * @param {string} htmlString шаблон
		 * @param {data} data данные для шаблона 
		 * @returns {undefined}
		 */
		createEl: function (htmlString, data) {
			var tmp = document.createElement('tmp');

			tmp.innerHTML = Mustache.render(htmlString.trim(), data || false);

			return tmp.firstChild;
		},

		/**
		 * Формирование переменных, используемых в шаблонах
		 * @param {object} field 
		 * @returns {undefined}
		 */
		addMustacheVars: function (field) {
			var fieldType = field["type"];

			if (field["type"] === 'tel' || field["type"] === 'email' || field["type"] === 'password') {
				fieldType = 'text';
			}

			field["is" + fieldType.capitalize()] = true;

			return field;
		},

		/**
		 * Сборка HTML строки формы
		 * @param {object} row объект строки формы
		 * @returns {undefined}
		 */
		getRowHTML: function (row) {
			var $row;
			var rowHTML = "";

			for (var i = 0; i < row.fields.length; i++) {
				// если указана сетка, но не прописаны колонки
				if (this._stepData.grid > 1 && row.fields[i].col === undefined) {
					row.fields[i].col = Math.floor(this._stepData.grid / row.fields.length);
				} else {
					row.fields[i].col = Number(row.fields[i].col) || 1;
				}

				row.fields[i] = this.addMustacheVars(row.fields[i]);
				row.fields[i].rowClass = row.fields[i].col === this._stepData.grid ? "pure-u-1" : "pure-u-" + row.fields[i].col + "-" + this._stepData.grid;
				row.fields[i].inputClass = "pure-u-23-24";
				row.fields[i].cols = row.fields.length;

				$row = this.createEl(this._tpls.row, row.fields[i]);
				rowHTML += $row.outerHTML;
			}

			return rowHTML;
		},

		/**
		 * Сборка HTML формы
		 * @param {int} step 
		 * @returns {undefined}
		 */
		getStepHTML: function (step) {
			var formHTML = "";

			this._stepData = this._formJSON.steps[step];
			this._stepData.grid = Number(this._stepData.grid) || 1;

			for (var row = 0; row < this._stepData.rows.length; row++) {
				formHTML += this.getRowHTML(this._stepData.rows[row]);
			}

			return formHTML;
		},

		/**
		 * Сборка кнопки
		 * @param {object} context кнопка для всей формы или таба
		 * @returns {undefined}
		 */
		getButtons: function (context) {
			var $buttons = [];

			if (!context || !context.buttons) {
				return false;
			}
			for (var i = 0; i < context.buttons.length; i++) {
				$buttons.push(this.createEl(this._tpls.button, context.buttons[i]));
			}


			return $buttons;
		},

		/**
		 * Генерация кнопок
		 * @param {object} context Какие кнопки.
		 * @param {string} selector Куда вставить.
		 * @returns {undefined}
		 */
		renderButtons: function (context, selector) {
			var $button;

			if (!context || !context.buttons || !selector) {
				return false;
			}

			for (var i = 0; i < context.buttons.length; i++) {
				context.buttons[i].align = context.buttons[i].align || "center";
				context.buttons[i].col = Math.ceil(24 / context.buttons.length);
				$button = this.createEl(this._tpls.button, context.buttons[i]);
				this._$el.formHolder.querySelector(selector).appendChild($button);
			}
		},

		/**
		 * Генерация страницы
		 * @returns {undefined}
		 */
		renderPage: function () {
			var tabsInfo = {items: []};

			for (var step = 0; step < this._formJSON.steps.length; step++) {
				tabsInfo['items'].push({
					index: step,
					form: this.getStepHTML(step),
					name: this._formJSON.steps[step].name,
					title: this._formJSON.steps[step].title,
					first: step === 0
				});
			}

			tabsInfo['title'] = this._formJSON.title;
			tabsInfo['hasTabs'] = this._formJSON.steps.length > 1;

			this._$el.formHolder.appendChild(this.createEl(this._tpls.page, tabsInfo));

			this.renderButtons(this._formJSON, '.page-buttons');

			for (var step = 0; step < this._formJSON.steps.length; step++) {
				this.renderButtons(this._formJSON.steps[step], '.tab-buttons-' + step);
			}
		},

		/**
		 ********************************* CORE *************************************
		 */

		/**
		 * Подгрузка шаблона
		 * @returns {undefined}
		 */
		loadTemplate: function (tpl) {
			var self = this;

			this.request({
				url: 'stat/tpl/' + tpl + '.mst',
				success: function (data) {
					self._tpls[tpl] = data;
					Mustache.parse(data); //?
					self._tplLoaded++;
					// Все шаблоны подгрузили, запускаем триггер на рендер страницы
					if (self._tplLoaded >= self._tplsToLoad.length) {
						self.render();
					}
				},
				dataType: 'text'
			});
		},

		/**
		 * Подгрузка шаблонов
		 * @returns {undefined}
		 */
		loadTemplates: function () {
			for (var i = 0; i < this._tplsToLoad.length; i++) {
				this.loadTemplate(this._tplsToLoad[i]);
			}

		},

		/**
		 * Подгрузка шаблонов
		 * @returns {undefined}
		 */
		loadCSS: function () {
			var a = document.createElement("link");
			a.rel = "stylesheet";
			a.href = ""; // Должен быть файл со стилями

			document.getElementsByTagName("head")[0].appendChild(a);
		},

		/**
		 * Подгрузка шаблонов
		 * @returns {undefined}
		 */
		loadTemplates2: function () {
			var $tpls = document.querySelectorAll('script[type="x-tmpl-mustache"]');

			for (var i = 0; i < $tpls.length; i++) {
				this._tpls[$tpls[i].id] = $tpls[i].innerHTML;
			}
		},

		/**
		 * serialize
		 * @param {type} obj
		 * @param {type} prefix
		 * @returns {String}
		 */

		serialize: function (obj, prefix) {
			var str = [];
			var p;

			for (p in obj) {
				if (obj.hasOwnProperty(p)) {
					var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
					str.push((v !== null && typeof v === "object") ?
							this.serialize(v, k) :
							encodeURIComponent(k) + "=" + encodeURIComponent(v));
				}
			}
			return str.join("&");
		},

		/**
		 * Получение данных формы
		 * @param {object} $form 
		 * @param {string} name 
		 * @returns {undefined}
		 */
		getFormData: function ($form, name) {
			var field;
			var formData = [];
			var el;
			var $radio;
			var passedFields = {};

			// Если пришла одна форма, а не NodeList, эмулируем массив, чтобы дальше не менять код.
			if (!NodeList.prototype.isPrototypeOf($form)) {
				$form = [$form];
			}

			for (var f = 0; f < $form.length; f++) {
				for (var i = 0; i < $form[f].elements.length; i++) {
					el = $form[f].elements[i];
					field = this.getFieldByName(el.name);

					if (el.type === "text" || el.type === "email" || el.type === "tel" || el.type === "password" || el.nodeName === "TEXTAREA") {
						field.value = el.value || '';

					} else if (el.type === "radio") {
						// Элементов radio с одинаковым именем будет несколько. При первой встрече производим всю обработку и дальше пропускаем.
						if (!passedFields[el.name]) {
							$radio = document.querySelector('input[name="' + el.name + '"]:checked');

							if ($radio && $radio.checked) {
								field.value = $radio.value;
							}
						} else {
							break;
						}

					} else if (el.type === "checkbox") {
						field.value = el.checked;

					} else if (el.nodeName === "SELECT") {
						field.value = el.value || '';
					}

					// если name не указали, добавляем все поля
					if ((!name || name === el.name) && el.name) {
						formData.push(field);
					}

					passedFields[el.name] = true;
				}
			}

			return formData;
		},

		/**
		 * Отправка запросов
		 * @param {object} requestData
		 * @returns {undefined}
		 */
		request: function (requestData) {
			var self = this;
			var request = new XMLHttpRequest();
			var responseText;

			requestData.data = requestData.data ? this.serialize(requestData.data) : null;
			requestData.method = requestData.method === "POST" ? "POST" : "GET";
			requestData.dataType = !requestData.dataType ? "json" : requestData.dataType;

			if (requestData.method === "GET" && requestData.data) {
				requestData.url += "?" + requestData.data;
			}

			request.open(requestData.method, requestData.url, true);

			if (requestData.method === "POST") {
				request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
			}
			request.onload = function () {
				if (request.status >= 200 && request.status < 400) {
					if (requestData.success) {
						if (requestData.dataType === "json") {
							responseText = JSON.parse(request.responseText);
						} else {
							responseText = request.responseText;
						}
						requestData.success.apply(self, [responseText]);
					}
				} else {
					console.log('We reached our target server, but it returned an error');
				}
			};

			request.onerror = function () {
				console.log('There was a connection error of some sort');
			};

			request.send(requestData.data);
		},

		/**
		 * Проверка Email на валидность
		 * @param {string} email 
		 * @returns {Boolean}
		 */
		isEmailValid: function (email) {
			return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
		},

		/**
		 * Вставка элемента после другого
		 * @param {object} newNode
		 * @param {object} referenceNode
		 * @deprecated Не используется.
		 * @returns {undefined}
		 */
		insertAfter: function (newNode, referenceNode) {
			referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
		},

		/**
		 * Получение данных поля по имени
		 * @param {string} name Имя поля
		 * @todo Пересмотреть. Жуть, да и по ресурсам не очень.
		 * @returns {object} field
		 */
		getFieldByName: function (name) {
			var field = {};

			for (var i0 = 0; i0 < this._formJSON.steps.length; i0++) {
				for (var i = 0; i < this._formJSON.steps[i0].rows.length; i++) {
					for (var i2 = 0; i2 < this._formJSON.steps[i0].rows[i].fields.length; i2++) {
						if (name === this._formJSON.steps[i0].rows[i].fields[i2].name) {
							field = this._formJSON.steps[i0].rows[i].fields[i2];
						}
					}
				}
			}

			return field;
		},

		/**
		 * Наличие класса у элемента
		 * @param {object} $el
		 * @param {string} className
		 * @returns {boolean} field
		 */
		hasClass: function ($el, className) {
			if ($el.classList) {
				return $el.classList.contains(className);
			} else {
				return new RegExp('(^| )' + className + '( |$)', 'gi').test($el.className);
			}
		},

		/**
		 */
		c: function (v, t) {
			if (t) {
				console.log(t + ":", v);
			} else {
				console.log(v);
			}
		}
	};
}());

/**
 * POLYFILLS
 */


(function () {
	/**
	 * Element.matches method
	 */
	if (!Element.prototype.matches) {
		Element.prototype.matches = Element.prototype.msMatchesSelector;
	}

	/**
	 * Element.closest method
	 */
	if (!Element.prototype.closest) {
		Element.prototype.closest = function (css) {
			var node = this;

			while (node) {
				if (node.matches(css)) {
					return node;
				} else {
					node = node.parentElement;
				}
			}
			return null;
		};
	}

	/**
	 * String.capitalize method
	 */
	if (!String.prototype.capitalize) {
		String.prototype.capitalize = function () {
			return this.charAt(0).toUpperCase() + this.slice(1);
		};
	}

	/**
	 * Document.querySelectorAll method
	 * Needed for: IE7-
	 */
	if (!document.querySelectorAll) {
		document.querySelectorAll = function (selectors) {
			var style = document.createElement('style'), elements = [], element;
			document.documentElement.firstChild.appendChild(style);
			document._qsa = [];

			style.styleSheet.cssText = selectors + '{x-qsa:expression(document._qsa && document._qsa.push(this))}';
			window.scrollBy(0, 0);
			style.parentNode.removeChild(style);

			while (document._qsa.length) {
				element = document._qsa.shift();
				element.style.removeAttribute('x-qsa');
				elements.push(element);
			}
			document._qsa = null;
			return elements;
		};
	}
	/**
	 *	 window.CustomEvent method
	 *	 Needed for: IE9+
	 */

	if (typeof window.CustomEvent !== "function") {
		function CustomEvent(event, params) {
			params = params || {bubbles: false, cancelable: false, detail: undefined};
			var evt = document.createEvent('CustomEvent');
			evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
			return evt;
		}

		CustomEvent.prototype = window.Event.prototype;

		window.CustomEvent = CustomEvent;
	}

	/**
	 *	 Document.querySelector method
	 *	 Needed for: IE7-
	 */
	if (!document.querySelector) {
		document.querySelector = function (selectors) {
			var elements = document.querySelectorAll(selectors);
			return (elements.length) ? elements[0] : null;
		};
	}

	/**
	 * Консоль с отображением названия переменной.
	 * Попробовать дописать, когда будет время.
	 */
	if (!Object.prototype.c) {
		Object.prototype.c = function () {
			console.log(this);
			if (t) {
				console.log(t + ":", 'ggg');
				console.log(v, 'ggg');
				console.log("------------------------------------------------------------", 'ggg');
			} else {
				console.log(v);
			}
			return this;
		};
	}

	/**
	 * Array.isArray method
	 * @deprecated не используется
	 */
	if (!Array.isArray) {
		Array.isArray = function (arg) {
			return Object.prototype.toString.call(arg) === '[object Array]';
		};
	}
})();



/**
 * INIT
 */
formGenerator.init();