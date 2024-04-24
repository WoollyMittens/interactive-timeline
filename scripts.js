class IntersectionEvents {
	constructor(options) {
		const defaults = {
			root: null,
			rootMargin: "0px 0px 0px 0px",
			threshold: [0]
		};
		this.options = {...defaults, ...options};
		this.observer = new IntersectionObserver(this.handle.bind(this), this.options);
	}
	watch(elem) {
		this.observer.observe(elem);
	}
	handle(intersections, observer) {
		for (let intersection of intersections) {
			let evt = new CustomEvent("visible", {
				bubbles: true,
				cancelable: false,
				detail: {
					intersection: intersection,
					observer: observer,
				},
			});
			intersection.target.dispatchEvent(evt);
		}
	}
}

class DragScroller {
	constructor(container, handler) {
		this.container = container;
		this.handler = handler;
		this.previous = null;
		this.distance = 0;
		this.inertia = 0;
		this.timeout = null;
		this.container.addEventListener("mousedown", this.onPickupScroller.bind(this));
		this.container.addEventListener("mousemove", this.onDragScroller.bind(this));
		document.body.addEventListener("mouseup", this.onDropScroller.bind(this));
		this.container.addEventListener("scroll", this.onManualScroller.bind(this), { passive: true });
	}

	onPickupScroller(evt) {
		if (window.matchMedia("(pointer:fine)")) {
			this.previous = evt.clientX;
		}
	}

	onDragScroller(evt) {
		if (this.previous !== null) {
			evt.preventDefault(evt);
			let current = evt.clientX;
			let offset = current - this.previous;
			this.container.scrollBy({ left: -offset });
			this.inertia = offset;
			this.distance += offset;
			this.previous = current;
		}
	}

	onDropScroller(evt) {
		if (window.matchMedia("(pointer:fine)")) {
			this.decayScroll();
		}
		this.previous = null;
		this.distance = 0;
	}

	onManualScroller(evt) {
		this.handler(this.container, evt);
	}

	decayScroll() {
		window.requestAnimationFrame(() => {
			this.inertia *= 0.9;
			this.container.scrollBy({ left: -this.inertia });
			if (Math.abs(this.inertia) >= 2) this.decayScroll(this.container);
		});
	}
}

class InteractiveTimeline {
	constructor(config) {
		this.config = config;
		this.rootElement = document.querySelector(config.element);
		this.sliderElement = this.rootElement.querySelector(config.slider);
		this.overviewElement = this.rootElement.querySelector(config.overview);
		this.sliderPages = [...this.sliderElement.querySelectorAll(config.pages)];
		this.eventCards = [...this.sliderElement.querySelectorAll(config.events)];
		this.thumbnailPages = [...this.overviewElement.querySelectorAll(config.pages)];
		this.enlargeButton = this.rootElement.querySelector(config.enlarge);
		this.backButton = this.rootElement.querySelector(config.back);
		this.forwardButton = this.rootElement.querySelector(config.forward);
		this.sliderTimeout = null;
		this.overviewTimeout = null;
		
		/* keep track of the focus */
		this.focusElement = null;
		this.sliderElement.addEventListener('mouseover', () => { this.focusElement = this.sliderElement });
		this.sliderElement.addEventListener('touchstart', () => { this.focusElement = this.sliderElement });
		this.overviewElement.addEventListener('mouseover', () => { this.focusElement = this.overviewElement });
		this.overviewElement.addEventListener('touchstart', () => { this.focusElement = this.overviewElement });
		
		/* click controls */
		this.enlargeButton.addEventListener("click", this.onBreakOut.bind(this));
		this.backButton.addEventListener("click", this.onPreviousPage.bind(this));
		this.forwardButton.addEventListener("click", this.onNextPage.bind(this));
		
		/* main drag controls */
		this.sliderScroller = new DragScroller(this.sliderElement, this.onSliderScrolled.bind(this));
		this.overviewScroller = new DragScroller(this.overviewElement, this.onOverviewScrolled.bind(this));

		/* intersections
		this.intersectionsEvents = new IntersectionEvents();
		for (let card of this.eventCards) {
			this.intersectionsEvents.watch(card);
			card.addEventListener("visible", this.onPageRevealed.bind(this, card));
		}
		for (let page of this.sliderPages) {
			this.intersectionsEvents.watch(page);
			page.addEventListener("visible", this.onPageRevealed.bind(this, page));
		}
		*/

		/* handle thumnail clicks */
		for (let page of this.thumbnailPages) {
			page.addEventListener("click", this.onThumbnailPageClick.bind(this, page));
		}
		
		/* starting state */
		this.focusOnPage(this.sliderPages[this.closestIndex], true);
	}

	get closestIndex() {
		return +this.rootElement.getAttribute('data-index');
	}

	set closestIndex(value) {
		this.rootElement.setAttribute('data-index', value);
	}

	onBreakOut(evt) {
		evt.preventDefault(evt);
		const state = (this.rootElement.getAttribute('data-breakout') === 'true');
		this.rootElement.setAttribute('data-breakout', !state);
	}

	onPreviousPage(evt) {
		evt.preventDefault(evt);
		let currentIndex = this.closestIndex;
		let previousIndex = Math.max(currentIndex - 1, 0);
		this.focusOnPage(this.sliderPages[previousIndex]);
	}

	onNextPage(evt) {
		evt.preventDefault(evt);
		let currentIndex = this.closestIndex;
		let nextIndex = Math.min(currentIndex + 1, this.sliderPages.length - 1);
		this.focusOnPage(this.sliderPages[nextIndex]);
	}

	onSliderScrolled() {
		clearTimeout(this.sliderTimeout);
		if (this.focusElement === this.sliderElement) {
			this.sliderTimeout = setTimeout(() => {
				const closestSlide = this.findClosestSlide(this.sliderElement, this.sliderPages);
				this.closestIndex = this.sliderPages.indexOf(closestSlide);
				this.thumbnailPages[this.closestIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
			}, 500);
		}
	}

	onOverviewScrolled() {
		clearTimeout(this.overviewTimeout);
		if (this.focusElement === this.overviewElement) {
			this.overviewTimeout = setTimeout(() => {
				console.log('this.focusElement', this.focusElement);
				const closestThumbnail = this.findClosestSlide(this.overviewElement, this.thumbnailPages);
				this.closestIndex = this.thumbnailPages.indexOf(closestThumbnail);
				this.sliderPages[this.closestIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
			}, 300);
		}
	}

	onPageRevealed(page, evt) {
		page.setAttribute('data-visible', evt.detail.intersection.isIntersecting);
	}

	onThumbnailPageClick(page, evt) {
		if (Math.abs(this.sliderScroller.distance) < 10) {
			const index = this.thumbnailPages.indexOf(page);
			this.focusOnPage(this.sliderPages[index]);
		}
		evt.preventDefault();
	}

	focusOnPage(element, instant) {
		if (instant) {
			const closestSlide = this.findClosestSlide(element, this.sliderPages);
			this.closestIndex = this.sliderPages.indexOf(closestSlide);
			element.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
			this.thumbnailPages[this.closestIndex].scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
		} else {
			this.focusElement = this.sliderElement;
			setTimeout(() => { element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }) }, 100);
		}
	}

	findClosestSlide(container, elements) {
		const containerRect = container.getBoundingClientRect();
		const pageElements = elements || container.querySelectorAll(this.config.pages);
		let smallestOffset = 9999;
		let closestElement = pageElements[0];
		for (let pageElement of pageElements) {
			let pageRect = pageElement.getBoundingClientRect();
			let pageCenter = pageRect.left - containerRect.left + pageRect.width / 2;
			let containerCenter = containerRect.width / 2;
			let centerOffset = Math.abs(containerCenter - pageCenter);
			if (centerOffset < smallestOffset) {
				smallestOffset = centerOffset;
				closestElement = pageElement;
			}
		}
		return closestElement;
	}
}

window.interactiveTimeline = new InteractiveTimeline({
	element: ".it-timeline",
	slider: ".it-slider",
	overview: ".it-overview",
	pages: ".it-slide, .it-thumbnail",
	events: ".it-events li",
	enlarge: ".it-enlarge",
	back: ".it-back",
	forward: ".it-forward",
});
