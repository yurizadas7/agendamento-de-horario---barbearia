

const cards = document.querySelectorAll(".card");

function mostrarCards() {
    cards.forEach(card => {

        const posicao = card.getBoundingClientRect().top;

        if (posicao < window.innerHeight - 100) {
            card.classList.add("mostrar");
        }

    });
}

window.addEventListener("scroll", mostrarCards);

mostrarCards();




let numero = 0;

const contador = document.getElementById("contador");

const intervalo = setInterval(() => {

    numero += 10;

    contador.textContent = numero + "+";

    if (numero >= 500) {

        contador.textContent = "500+";

        clearInterval(intervalo);
    }

}, 50);