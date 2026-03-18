
/*
============================================================
SECURECAM - LOGIN PAGE SCRIPT (login.js)
============================================================

Purpose
-------
Handles login and signup functionality on the client side.

Responsibilities
----------------
1. Switch between login and signup forms
2. Validate user input before sending to server
3. Send login/signup requests to Flask backend
4. Display validation errors to user

Connected Backend Routes
------------------------
POST /login
POST /signup
*/


/* =====================================================
   FORM SWITCHING
   ===================================================== */

/* Show signup form */
function showSignup() {

  document.getElementById("loginForm").style.display = "none";
  document.getElementById("signupForm").style.display = "block";

}

/* Show login form */
function showLogin() {

  document.getElementById("signupForm").style.display = "none";
  document.getElementById("loginForm").style.display = "block";

}



/* =====================================================
   NAVIGATION MENU
   ===================================================== */

function toggleMenu(){

  const menu = document.getElementById("sideMenu");

  if(menu.style.right === "0px"){
    menu.style.right = "-300px";
  }
  else{
    menu.style.right = "0px";
  }

}



/* =====================================================
   GO BACK TO HOME PAGE
   ===================================================== */

function goHome(){

  window.location.href = "/";

}



/* =====================================================
   LOGIN VALIDATION
   ===================================================== */

async function validateLogin(){

  let username = document.getElementById("loginUsername").value.trim();
  let password = document.getElementById("loginPassword").value.trim();

  let valid = true;

  /* Clear previous errors */

  document.getElementById("loginUserError").innerText="";
  document.getElementById("loginPassError").innerText="";

  /* Username validation */

  if(username === ""){
    document.getElementById("loginUserError").innerText="Username required";
    valid=false;
  }

  /* Password validation */

  if(password === ""){
    document.getElementById("loginPassError").innerText="Password required";
    valid=false;
  }

  if(password.length < 6){
    document.getElementById("loginPassError").innerText="Password must be at least 6 characters";
    valid=false;
  }

  if(!valid) return;

  /* Send login request to backend */

  const formData = new FormData();

  formData.append("username", username);
  formData.append("password", password);

  const res = await fetch("/login",{
    method:"POST",
    body:formData
  });

  /* If backend redirects → login successful */

  if(res.redirected){
    window.location.href = res.url;
  }
  else{

    const text = await res.text();
    alert(text);

  }

}



/* =====================================================
   SIGNUP VALIDATION
   ===================================================== */

async function validateSignup(){

  let username = document.getElementById("signupUsername").value.trim();
  let password = document.getElementById("signupPassword").value.trim();
  let confirm = document.getElementById("confirmPassword").value.trim();
  let email = document.getElementById("email").value.trim();
  let dob = document.getElementById("dob").value;
  let phone = document.getElementById("phone").value.trim();

  let valid = true;

  /* Clear previous errors */

  document.getElementById("signupUserError").innerText="";
  document.getElementById("signupPassError").innerText="";
  document.getElementById("confirmPassError").innerText="";
  document.getElementById("emailError").innerText="";
  document.getElementById("dobError").innerText="";
  document.getElementById("phoneError").innerText="";


  /* Username validation */

  if(username === ""){
    document.getElementById("signupUserError").innerText="Username required";
    valid=false;
  }


  /* Password validation */

  if(password.length < 6){
    document.getElementById("signupPassError").innerText="Password must be at least 6 characters";
    valid=false;
  }


  /* Password confirmation */

  if(password !== confirm){
    document.getElementById("confirmPassError").innerText="Passwords do not match";
    valid=false;
  }


  /* Email validation */

  if(email === ""){
    document.getElementById("emailError").innerText="Email required";
    valid=false;
  }


  /* Date of birth validation */

  if(dob === ""){
    document.getElementById("dobError").innerText="Select date of birth";
    valid=false;
  }


  /* Phone validation */

  if(phone.length !== 10){
    document.getElementById("phoneError").innerText="Phone must be 10 digits";
    valid=false;
  }


  if(!valid) return;


  /* Send signup request to backend */

  const formData = new FormData();

  formData.append("username", username);
  formData.append("password", password);
  formData.append("email", email);
  formData.append("phone", phone);
  formData.append("dob", dob);

  const res = await fetch("/signup",{
    method:"POST",
    body:formData
  });


  if(res.redirected){

    alert("Account created successfully!");

    window.location.href = res.url;

  }
  else{

    const text = await res.text();
    alert(text);

  }

}
