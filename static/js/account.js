
/*
============================================================
SECURECAM - ACCOUNT PAGE SCRIPT (account.js)
============================================================

Purpose
-------
Handles account management functionality.

Features
--------
1. Load user account information
2. Update user details
3. Delete account permanently
4. Toggle password visibility
5. Logout user

Connected Backend APIs
----------------------
GET  /account_data
POST /update_account
POST /delete_account
GET  /logout
*/


/* =====================================================
   GLOBAL VARIABLE
   ===================================================== */

let currentPassword = "";


/* =====================================================
   LOAD ACCOUNT DATA
   ===================================================== */

async function loadAccount(){

    /* Fetch user data from server */

    const res = await fetch("/account_data");
    const data = await res.json();

    /* Populate form fields */

    document.getElementById("userid").innerText = data.id;
    document.getElementById("username").value = data.username;
    document.getElementById("email").value = data.email;
    document.getElementById("phone").value = data.phone;
    document.getElementById("dob").value = data.dob;

    /* Store password (for comparison when updating) */

    currentPassword = data.password;

    document.getElementById("password").value = currentPassword;

}



/* =====================================================
   TOGGLE PASSWORD VISIBILITY
   ===================================================== */

function togglePassword(){

    const field = document.getElementById("password");

    if(field.type === "password"){
        field.type = "text";
    }
    else{
        field.type = "password";
    }

}



/* =====================================================
   UPDATE ACCOUNT
   ===================================================== */

async function updateAccount(){

    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const dob = document.getElementById("dob").value;
    const password = document.getElementById("password").value;

    const formData = new FormData();

    formData.append("username",username);
    formData.append("email",email);
    formData.append("phone",phone);
    formData.append("dob",dob);
    formData.append("password",password);

    const res = await fetch("/update_account",{
        method:"POST",
        body:formData
    });

    const msg = await res.text();

    alert(msg);

    /* If password changed → user must login again */

    if(msg.includes("login again")){
        window.location.href="/login";
    }

}



/* =====================================================
   DELETE ACCOUNT
   ===================================================== */

async function deleteAccount(){

    if(!confirm("Delete your account permanently?")){
        return;
    }

    const res = await fetch("/delete_account",{
        method:"POST"
    });

    const msg = await res.text();

    alert(msg);

    window.location.href="/login";

}



/* =====================================================
   LOGOUT
   ===================================================== */

function logout(){

    window.location.href="/logout";

}



/* =====================================================
   INITIAL PAGE LOAD
   ===================================================== */

/* Load account information when page opens */

loadAccount();

//  for fronted

function toggleMenu() {
  const menu = document.getElementById("sideMenu");

  if (menu.style.right === "0px") {
    menu.style.right = "-300px";
  } else {
    menu.style.right = "0px";
  }
}