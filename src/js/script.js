'use strict';

// prettier-ignore
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

class Workout {
    date = new Date();
    id = (Date.now() + "").slice(-10);

    constructor(coords, distance, duration) {
        this.coords = coords;
        this.distance = distance;
        this.duration = duration;
    }
    async _getLocationName() {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${this.coords[0]}&lon=${this.coords[1]}&format=json`
            );

            if (!response.ok) throw new Error('Failed to fetch location');

            const data = await response.json();

            // Extract city and country
            const city = data.address.city ||
                data.address.town ||
                data.address.village ||
                data.address.suburb ||
                'Unknown location';
            const country = data.address.country || '';

            return `${city}, ${country}`;
        } catch (err) {
            console.error('Error getting location:', err);
            return 'Unknown location';
        }
    }
    async _setDescription() {
        const location = await this._getLocationName();
        this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} in ${location} on ${months[this.date.getMonth()]} ${this.date.getDate()}`;
        return this.description;
    }
}

class Running extends Workout {
    type = 'running'

    constructor(coords, distance, duration, cadence) {
        super(coords, distance, duration);
        this.cadence = cadence;
        this.calcPace();
    }

    calcPace() {
        //min/km
        this.pace = this.duration / this.distance;
        return this.pace;
    }
}

class Cycling extends Workout {
    type = 'cycling'

    constructor(coords, distance, duration, elevation) {
        super(coords, distance, duration);
        this.elevation = elevation;
        this.calcSpeed()
    }

    calcSpeed() {
        this.speed = this.distance / (this.duration / 60)
        return this.speed;
    }
}

/////////////////////////////////
//App archit

const form = document.querySelector('.form');
let containerWorkouts = document.querySelector('.workouts');
const toolsContainer = document.querySelector('.tools');
const editBtn = document.querySelector('.edit-btn');
const sortBtn = document.querySelector('.sort-btn');
const deleteBtnClicker = document.querySelector('.delete-btn');
const deleteOptContainer = document.querySelector('.tooltip');
const deleteWorkoutOption = document.querySelector('[name="delete"]');
const deleteAllWorkoutOption = document.querySelector('[name="delete-all"]');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const popUpClose = document.querySelector('.close-btn')
const overlayPopUp = document.querySelector("#overlay");
const popUp = document.querySelector(".popup");
const popUpHeading = document.getElementById("popup-title");
const errorH = "Error!";
const successM = "Success!"
const popUpMessage = document.getElementById("popup-message-content");


class App {
    #map;
    #mapZoomLevel = 13;
    #mapEvent;
    #sorted = false;
    #workouts = [];
    #currentWorkout;
    #editValues = null;
    #isEdit;

    constructor() {
        this._getPosition();
        this._getLocalStorage();
        this._moveToPopup = this._moveToPopup.bind(this);
        form.addEventListener('submit', this._newWorkout.bind(this));
        inputType.addEventListener('change', this._toggleElevationField);
        containerWorkouts.addEventListener('click', this._handleWorkoutClick.bind(this));
        deleteBtnClicker.addEventListener('click', this._showDeleteOptions.bind(this));
        editBtn.addEventListener('click', this._editCurrentWorkout.bind(this));
        sortBtn.addEventListener('click', this._sortByDistance.bind(this))
        deleteWorkoutOption.addEventListener('click', this._deleteCurrentWorkout.bind(this));
        deleteAllWorkoutOption.addEventListener('click', this._deleteAllWorkouts.bind(this));
        popUpClose.addEventListener('click', this._togglePopUp.bind(this))
    }

    _getPosition() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(this._loadMap.bind(this), function () {
                alert("Couldn't get your position strangah")
            });
        }
    }

    _loadMap(position) {
        const {latitude} = position.coords;
        const {longitude} = position.coords;
        const coords = [latitude, longitude];
        this.#map = L.map('map').setView(coords, this.#mapZoomLevel);

        L.tileLayer('https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.#map);

        this.#map.on('click', this._showForm.bind(this));

        this.#workouts.forEach(work => {
            this._renderWorkoutMarker(work)
        })
    }

    _togglePopUp() {
        overlayPopUp.classList.toggle('hidden');
        popUp.classList.toggle('hidden');
    }

    _handleWorkoutClick(e) {
        const workoutEl = e.target.closest('.workout');
        if (!workoutEl) return;

        const workout = this.#workouts.find(work => work.id === workoutEl.dataset.id);
        if (!workout) return;

        this.#currentWorkout = workout;
        this._showTools();
        this._moveToPopup(workout);
    }

    _sortByDistance(e) {
        e.preventDefault()
        this.#sorted = !this.#sorted;
        const works = this.#sorted ? this.#workouts.slice().sort((a, b) => a.distance - b.distance) : this.#workouts;
        const workoutElements = containerWorkouts.querySelectorAll('.workout');
        workoutElements.forEach(workout => workout.remove());
        works.forEach((work) => {
            this._renderWorkout(work);
        });
    }

    _showForm(mapE) {
        this.#mapEvent = mapE;
        form.classList.remove('hidden');
        inputDistance.focus()
    }

    _hideForm() {
        inputDistance.value = inputDuration.value = inputCadence.value = inputElevation.value = '';
        form.style.display = 'none';
        form.classList.add('hidden');
        setTimeout(() => (form.style.display = 'grid'), 1000);
    }

    _toggleElevationField() {
        inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
        inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
    }

    _validateFieldsForm(inputType, inputDistance, inputDuration, inputCadence, inputElevation) {
        const validInputs = (...inputs) => inputs.every(inp => Number.isFinite(inp));
        const allPositive = (...inputs) => inputs.every(inp => inp > 0);

        let isValid = true;
        if (inputType === 'running') {
            if (!validInputs(inputDistance, inputDuration, inputCadence) || !allPositive(inputDistance, inputDuration, inputCadence)) {
                isValid = false;
            }
        } else if (inputType === 'cycling') {
            if (!validInputs(inputDistance, inputDuration, inputElevation) || !allPositive(inputDistance, inputDuration)) {
                isValid = false;
            }
        }
        if (!isValid) {
            popUpHeading.innerHTML = errorH;
            popUpMessage.innerHTML = 'Please, input correct values in each field.';
            popUpHeading.classList.remove('success');
            return false; // Validation failed
        } else {
            popUpHeading.innerHTML = successM;
            popUpMessage.innerHTML = this.#isEdit
                ? 'The workout has been successfully edited!'
                : 'The workout has been successfully added!';
            popUpHeading.classList.add('success');
            return true; // Validation succeeded
        }
    }

//Workouts
    async _newWorkout(e) {
        e.preventDefault();

        const type = inputType.value;
        const distance = +inputDistance.value;
        const duration = +inputDuration.value;
        let cadence = null;
        let elevation = null;

        if (type === 'running') {
            cadence = +inputCadence.value;
        } else if (type === 'cycling') {
            elevation = +inputElevation.value;
        }

        if (!this._validateFieldsForm(type, distance, duration, cadence, elevation, false)) {
            this._togglePopUp();
            return;
        }

        let workout;
        const {lat, lng} = this.#mapEvent.latlng;

        if (type === 'running') {
            workout = new Running([lat, lng], distance, duration, cadence);
        } else if (type === 'cycling') {
            workout = new Cycling([lat, lng], distance, duration, elevation);
        }
        await workout._setDescription();
        this.#workouts.push(workout);
        this._renderWorkoutMarker(workout);
        this._renderWorkout(workout);
        this.#isEdit = false;
        this._hideForm();
        this._setLocalStorage();
        this._togglePopUp();
    }

    _editCurrentWorkout(e) {
        e.stopPropagation();
        e.preventDefault();
        this.#isEdit = true;
        // Find and hide the current workout element
        const workoutEl = document.querySelector(`[data-id="${this.#currentWorkout.id}"]`);
        if (workoutEl) {
            workoutEl.classList.add('hidden');
        }
        form.classList.remove('hidden');

        // Store the values and original date for later use
        this.#editValues = {
            originalId: this.#currentWorkout.id,
            originalDate: this.#currentWorkout.date,
            type: this.#currentWorkout.type,
            distance: this.#currentWorkout.distance,
            duration: this.#currentWorkout.duration,
            cadence: this.#currentWorkout.type === 'running' ? this.#currentWorkout.cadence : null,
            elevation: this.#currentWorkout.type === 'cycling' ? this.#currentWorkout.elevation : null
        };

        // Populate form
        inputType.value = this.#editValues.type;
        inputDistance.value = this.#editValues.distance;
        inputDuration.value = this.#editValues.duration;

        if (this.#editValues.type === 'running') {
            inputCadence.value = this.#editValues.cadence;
            inputElevation.closest('.form__row').classList.add('form__row--hidden');
            inputCadence.closest('.form__row').classList.remove('form__row--hidden');
        }
        if (this.#editValues.type === 'cycling') {
            inputElevation.value = this.#editValues.elevation;
            inputCadence.closest('.form__row').classList.add('form__row--hidden');
            inputElevation.closest('.form__row').classList.remove('form__row--hidden');
        }

        this.#mapEvent = {
            latlng: {lat: this.#currentWorkout.coords[0], lng: this.#currentWorkout.coords[1]}
        };

        // Switch event listeners
        this._boundEditSubmit = this._handleEditSubmit.bind(this);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._deleteCurrentWorkout(this.#currentWorkout);


            // Render the new workout and marker
            this._renderWorkout();
            this._renderWorkoutMarker();

            // Clean up the form and UI
            this._hideForm();

            this._setLocalStorage();
            this._togglePopUp();

            console.log("Workout edited and UI updated.");

            form.removeEventListener('submit', this._boundEditSubmit);
        }, {once: true});
    }

    _handleEditSubmit(e) {
        e.preventDefault();
        e.stopPropagation();

        const type = inputType.value;
        const distance = +inputDistance.value;
        const duration = +inputDuration.value;
        const {lat, lng} = this.#mapEvent.latlng;
        let workout;

        form.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Check type and validate inputs
                if (type === 'running') {
                    const cadence = +inputCadence.value;
                    if (!this._validateFieldsForm(type, distance, duration, cadence, null, true)) {
                        this._togglePopUp();
                        return;
                    }
                    workout = new Running([lat, lng], distance, duration, cadence);
                    workout.date = this.#editValues.originalDate;
                } else if (type === 'cycling') {
                    const elevation = +inputElevation.value;
                    if (!this._validateFieldsForm(type, distance, duration, null, elevation, true)) {
                        this._togglePopUp();
                        return;
                    }
                    workout = new Cycling([lat, lng], distance, duration, elevation);
                    workout.date = this.#editValues.originalDate;
                }

                // If validation passes, proceed to update and render workout
                if (workout) {
                    workout.date = this.#editValues.originalDate;
                    this._renderWorkout(workout);
                    this._renderWorkoutMarker(workout);

                    this._hideForm();
                    this._setLocalStorage();
                    this._togglePopUp();
                }
            }
        });

        // Reset event listeners
        form.removeEventListener('submit', this._boundEditSubmit);
    }


    _renderWorkoutMarker(workout) {
        inputDistance.value = inputDuration.value = inputCadence.value = inputElevation.value = '';
        L.marker(workout.coords).addTo(this.#map)
            .bindPopup(L.popup({
                maxWidth: 250, minWidth: 100, autoClose: false, closeOnClick: false, className: `${workout.type}-popup`
            }))
            .setPopupContent(`${workout.type === 'running' ? '🏃' : "🚴"} ${workout.description}️`)
            .openPopup();
    }

    _renderWorkout(workout) {
        let html = `
        <li class="workout workout--${workout.type}" data-id="${workout.id}">
          <h2 class="workout__title">${workout.description}</h2>
          <div class="workout__details">
            <span class="workout__icon">${workout.type === 'running' ? '🏃' : "🚴"}️</span>
            <span class="workout__value">${workout.distance}</span>
            <span class="workout__unit">km</span>
           </div>
          <div class="workout__details">
            <span class="workout__icon">⏱</span>
            <span class="workout__value">${workout.duration}</span>
            <span class="workout__unit">min</span>
          </div>
        `;

        if (workout.type === 'running') {
            html += `
            <div class="workout__details">
                <span class="workout__icon">⚡️</span>
                <span class="workout__value">${workout.pace.toFixed(1)}</span>
                <span class="workout__unit">min/km</span>
            </div>
            <div class="workout__details">
                <span class="workout__icon">🦶🏼</span>
                <span class="workout__value">${workout.cadence}</span>
                <span class="workout__unit">spm</span>
            </div>
            </li>`;
        } else if (workout.type === 'cycling') {
            html += `
            <div class="workout__details">
                <span class="workout__icon">⚡️</span>
                <span class="workout__value">${workout.speed.toFixed(1)}</span>
                <span class="workout__unit">km/h</span>
            </div>
            <div class="workout__details">
                <span class="workout__icon">⛰</span>
                <span class="workout__value">${workout.elevation}</span>
                <span class="workout__unit">m</span>
            </div>
            </li>
`;
        }

        form.insertAdjacentHTML('afterend', html);
    }

    _showTools() {
        editBtn.classList.remove('hidden');
        deleteBtnClicker.classList.remove('hidden');
    };

    _showDeleteOptions(e) {
        e.stopPropagation();
        deleteOptContainer.classList.toggle('hidden');
    }

    _deleteCurrentWorkout(workout) {
        if (!this.#currentWorkout) return;

        const index = this.#workouts.findIndex(work => work.id === this.#currentWorkout.id);
        if (index !== -1) {
            this.#workouts.splice(index, 1);
            this._setLocalStorage();
            // location.reload();
            const workoutEl = document.querySelector(`[data-id="${this.#currentWorkout.id}"]`);
            if (workoutEl) workoutEl.remove();
        }
    }

    _deleteAllWorkouts(e) {
        e.stopPropagation();
        this.reset();
    }

    _moveToPopup(workout) {
        this.#map.setView(workout.coords, this.#mapZoomLevel, {
            animate: true, pan: {
                duration: 1,
            }
        })
    }

    //Storage things
    _setLocalStorage() {
        const workoutsWithDescriptions = this.#workouts.map(work => ({
            ...work,
            description: work.description
        }));
        localStorage.setItem("workouts", JSON.stringify(workoutsWithDescriptions));
    }

    _getLocalStorage() {
        const data = JSON.parse(localStorage.getItem('workouts'));
        if (!data) return;

        this.#workouts = data.map(work => {
            // Create new Running or Cycling instance
            const workout = work.type === 'running'
                ? new Running(work.coords, work.distance, work.duration, work.cadence)
                : new Cycling(work.coords, work.distance, work.duration, work.elevation);

            // Restore the date and ID
            workout.date = new Date(work.date);
            workout.id = work.id;
            workout.description = work.description;
            return workout;
        });
        this.#workouts.forEach(work => {
            this._renderWorkout(work);
        });
    }

    reset() {
        localStorage.removeItem('workouts');
        location.reload();
    }
}

const app = new App();