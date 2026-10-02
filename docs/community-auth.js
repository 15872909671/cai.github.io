(() => {
  'use strict';
  const C=window.BlogCloud,E=window.BlogMarkdown.escape,main=document.getElementById('main'),account=document.getElementById('account-button');
  let busy=false,userId=null;
  const message=document.createElement('p');message.className='inline-message';message.hidden=true;message.setAttribute('role','status');main.before(message);
  const dialog=document.createElement('dialog');dialog.className='inline-dialog';document.body.append(dialog);
  let noticeTimer=null;
  function notice(text,error=false){clearTimeout(noticeTimer);message.hidden=!text;message.textContent=text;message.dataset.error=String(error);if(text)noticeTimer=setTimeout(()=>{message.hidden=true;message.textContent='';},error?8000:3500);}
  function authProgress(text){const button=dialog.querySelector('button[type="submit"],button.primary');if(button){button.dataset.idleText??=button.textContent;button.textContent=text;}const status=dialog.querySelector('#login-error');if(status)status.textContent='';}
  async function task(action){
    if(busy)return;busy=true;const modal=dialog.open,controls=[...dialog.querySelectorAll('input,select,button')].map(el=>[el,el.disabled]);
    main.inert=!modal;dialog.setAttribute('aria-busy','true');controls.forEach(([el])=>el.disabled=true);
    try{await action();}catch(e){const text=e.name==='TimeoutError'?'网络响应较慢，请重试；已填写的内容仍保留。':e.message;
      if(dialog.open){const error=dialog.querySelector('#login-error');if(error)error.textContent=text;}else notice(text,true);
    }finally{busy=false;main.inert=false;dialog.removeAttribute('aria-busy');controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});dialog.querySelectorAll('[data-idle-text]').forEach(el=>{el.textContent=el.dataset.idleText;delete el.dataset.idleText;});}
  }
  function popup(html){dialog.innerHTML=html+`<p id="login-error" role="alert"></p>`;if(!dialog.open)dialog.showModal();dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));}
  const codeCooldowns=new Map();
  function login(afterLogin=null,mode='login',email=''){
    const registering=mode==='signup';
    popup(`<form id="inline-login"><h2>${registering?'注册账号':'登录'}</h2>${registering?'<label>用户名<input name="displayName" autocomplete="nickname" minlength="2" maxlength="30" placeholder="2–30 个字符，可使用中文" required></label><label>公开 ID<input name="username" autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24" placeholder="3–24 位字母、数字或下划线" required></label>':''}<label>邮箱<input name="email" type="email" autocomplete="username" value="${E(email)}" required></label><label>密码<input name="password" type="password" autocomplete="${registering?'new-password':'current-password'}" ${registering?'minlength="8"':''} required></label>${registering?'<label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label><p>密码至少 8 位。通过邮箱验证码完成注册。</p>':''}${registering?'<label>邮箱验证码<div class="verification-row"><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required><button type="button" data-send-code>发送验证码</button></div></label>':''}<div class="dialog-actions"><button class="primary" type="submit">${registering?'注册':'登录'}</button><button type="button" data-close>取消</button></div><div class="auth-links"><button type="button" data-auth-switch>${registering?'已有账号？登录':'没有账号？注册'}</button>${registering?'':'<button type="button" data-resend>重发验证邮件</button>'}</div></form>`);
    const form=dialog.querySelector('form');
    let sentEmail='',verified=false,savedPassword='';
    function validRegistration(){
      const error=dialog.querySelector('#login-error');error.textContent='';
      form.elements.displayName.value=form.elements.displayName.value.trim();
      form.elements.username.value=form.elements.username.value.trim();
      for(const name of ['displayName','username','email','password','confirmPassword']){
        const field=form.elements[name];
        // Explicit length checks also cover autofill and programmatic input.
        if((name==='displayName'&&field.value.length<2)||(name==='password'&&field.value.length<8)){error.textContent=name==='displayName'?'用户名需为 2–30 个字符。':'密码至少需要 8 位。';field.focus();return false;}
        if(!field.reportValidity())return false;
      }
      if(form.elements.password.value!==form.elements.confirmPassword.value){error.textContent='两次输入的密码不一致。';form.elements.confirmPassword.focus();return false;}
      return true;
    }

    const send=form.querySelector('[data-send-code]');
    if(send){
      const update=()=>{if(!form.isConnected||!dialog.open){clearInterval(timer);return;}const seconds=Math.max(0,Math.ceil(((codeCooldowns.get(form.elements.email.value.trim().toLowerCase())||0)-Date.now())/1000));send.disabled=busy||seconds>0;send.textContent=seconds?seconds+' 秒后重发':sentEmail?'重新发送':'发送验证码';};
      const timer=setInterval(update,500);update();
      form.elements.email.addEventListener('input',()=>{verified=false;savedPassword='';form.elements.code.value='';update();});
      send.onclick=()=>{if(busy||!validRegistration())return;const target=form.elements.email.value.trim().toLowerCase();if((codeCooldowns.get(target)||0)>Date.now())return;
        task(async()=>{if(target===sentEmail){await C.checkRegistration(target,form.elements.username.value.trim());await C.resendConfirmation(target);}else{const result=await C.signup(target,form.elements.password.value,form.elements.username.value.trim(),form.elements.displayName.value.trim());verified=!result.needsConfirmation;savedPassword=form.elements.password.value;}
          sentEmail=target;codeCooldowns.set(target,Date.now()+60000);dialog.querySelector('#login-error').textContent='验证码已发送，请检查邮箱。';
        }).finally(update);
      };
    }
    form.querySelector('[data-auth-switch]').onclick=()=>{if(!busy)login(afterLogin,registering?'login':'signup',form.elements.email.value.trim());};
    form.querySelector('[data-resend]')?.addEventListener('click',()=>{if(!form.elements.email.reportValidity())return;task(async()=>{await C.resendConfirmation(form.elements.email.value.trim());dialog.querySelector('#login-error').textContent='若该邮箱需要验证，验证邮件将会发送，请检查收件箱和垃圾邮件。';});});
    form.addEventListener('submit',e=>{e.preventDefault();const email=form.elements.email.value.trim(),password=form.elements.password.value;
      if(registering&&!validRegistration())return;
      if(!form.reportValidity())return;
      task(async()=>{
        if(registering){if(sentEmail!==email.toLowerCase()){dialog.querySelector('#login-error').textContent='请先为当前邮箱获取验证码。';return;}if(!verified){authProgress('正在验证…');await C.verifyRegistration(sentEmail,form.elements.code.value.trim());verified=true;}authProgress('正在保存账号…');const results=await Promise.allSettled([C.setRegistrationPassword(savedPassword===password?undefined:password,form.elements.displayName.value.trim()).then(()=>{savedPassword=password;}),C.claimUsername(form.elements.username.value.trim())]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;authProgress('即将完成…');await C.logout();form.elements.password.value='';form.elements.confirmPassword.value='';login(afterLogin,'login',email);dialog.querySelector('#login-error').textContent='注册成功，请登录。';return;}
        authProgress('正在登录…');let user;try{user=await C.login(email,password);}finally{form.elements.password.value='';}
        userId=user.id;dialog.close();await window.CommunityApp.signedIn(user);notice('已登录。');
      }).then(()=>{if(userId&&!registering)afterLogin?.();});
    });
  }
  function verification(email,username,verified=false,afterLogin=null){
    let nextSend=Date.now()+60000;
    popup(`<form id="verify-registration"><h2>${verified?'设置公开 ID':'验证邮箱'}</h2><p>${verified?'邮箱已验证，请完成公开 ID 设置。':'验证码已发送至 '+E(email)}</p><label>公开 ID<input name="username" value="${E(username)}" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24" required></label><label>邮箱验证码<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" ${verified?'disabled':'required'}></label><div class="dialog-actions"><button class="primary">完成注册</button><button type="button" data-resend-code>重新发送</button><button type="button" data-close>取消</button></div></form>`);
    const form=dialog.querySelector('form');
    form.querySelector('[data-resend-code]').onclick=()=>{if(busy)return;if(Date.now()<nextSend){dialog.querySelector('#login-error').textContent='请在 '+Math.ceil((nextSend-Date.now())/1000)+' 秒后重新发送。';return;}task(async()=>{await C.resendConfirmation(email);nextSend=Date.now()+60000;dialog.querySelector('#login-error').textContent='验证码已重新发送。';});};
    form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;task(async()=>{authProgress('正在验证…');if(!verified){await C.verifyRegistration(email,form.elements.code.value.trim());verified=true;form.elements.code.required=false;form.elements.code.value='';}
      const publicName=await C.claimUsername(form.elements.username.value.trim());if(userId){dialog.close();await window.CommunityApp.signedIn(C.currentUser());notice('公开 ID 已保存。');return;}await C.logout();login(afterLogin,'login',email);dialog.querySelector('#login-error').textContent='注册成功，请登录。';
    });};
  }

  window.CommunityAuth={open:login,notice,isBusy:()=>busy,logout:async()=>{await C.logout();userId=null;await window.CommunityApp.signedOut();notice('已退出登录。');}};
  const returned=new URLSearchParams(location.hash.slice(1));
  if(returned.has('access_token')||returned.has('error_description')){history.replaceState(null,'',location.pathname+location.search+'#/');login();dialog.querySelector('#login-error').textContent=returned.has('error_description')?'验证链接已失效，请重新获取验证码。':'请使用邮箱和密码登录。';}
})();
