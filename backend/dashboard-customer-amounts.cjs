'use strict';
// Never invent a subtotal from a total: discounts and delivery may be present.
function validateAmounts(order){
 for(const key of ['subtotalCents','totalCents','discountCents','shippingCents'])if(!Number.isSafeInteger(order[key])||order[key]<0)throw Object.assign(Error('Valores da encomenda inválidos. Reveja o registo antes de gerar o documento.'),{status:409});
}
module.exports={validateAmounts};
