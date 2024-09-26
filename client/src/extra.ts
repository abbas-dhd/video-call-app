const blob = document.querySelector("#blob");

document.body.onpointermove = (e) => {
  const { clientX, clientY } = e;

  blob &&
    blob.animate(
      {
        left: `${clientX}px`,
        top: `${clientY}px`,
      },
      {
        duration: 3500,
        fill: "forwards",
      }
    );
};
