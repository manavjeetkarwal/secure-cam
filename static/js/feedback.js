function toggleMenu() {
  const menu = document.getElementById("sideMenu");
  menu.style.right = (menu.style.right === "0px") ? "-300px" : "0px";
}


// =========================
// INQUIRY FORM
// =========================
document.getElementById("inquiryForm").addEventListener("submit", async (e) => {

  e.preventDefault();

  const first_name = document.getElementById("inquiryName").value;
  const last_name = document.getElementById("inquiryLast").value;
  const email = document.getElementById("inquiryEmail").value;
  const phone = document.getElementById("inquiryPhone").value;
  const subject = document.getElementById("inquirySubject").value;
  const message = document.getElementById("inquiryMessage").value;

  const res = await fetch("/submit_inquiry", {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      first_name: first_name,
      last_name: last_name,
      email: email,
      phone: phone,
      subject: subject,
      message: message
    })

  });

  if(res.ok){

    alert("Inquiry submitted successfully!");

    document.getElementById("inquiryForm").reset();

  } else {

    alert("Failed to submit inquiry!");

  }

});


// =========================
// FEEDBACK FORM
// =========================
document.getElementById("submitFeedback").addEventListener("click", async () => {

  const message = document.getElementById("feedbackMessage").value;

  // get selected emoji rating
  const ratingElement = document.querySelector('input[name="rating"]:checked');

  if(!ratingElement){
    alert("Please select a rating emoji");
    return;
  }

  const rating = ratingElement.value;

  if(message.trim() === ""){
    alert("Please write feedback first");
    return;
  }

  const res = await fetch("/submit_feedback", {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      message: message,
      rating: rating
    })

  });

  if(res.ok){

    alert("Feedback submitted successfully!");

    document.getElementById("feedbackMessage").value = "";

  } else {

    alert("Failed to submit feedback!");

  }

});