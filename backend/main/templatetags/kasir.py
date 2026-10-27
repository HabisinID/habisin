from django import template

register = template.Library()


@register.filter
def pickup_code(code):
    """H7K49 → "H7K · 49", the way the buyer's ticket shows it."""
    return f"{code[:3]} · {code[3:]}"


@register.filter
def buyer_short(user):
    """Rani Ayu → "Rani A.": enough for the cashier to call the buyer, no more."""
    if not user.first_name:
        return user.username
    return f"{user.first_name} {user.last_name[0]}." if user.last_name else user.first_name


@register.filter
def rupiah(value):
    """10000 → "Rp10.000"; donations show "Gratis", like rupiah() in frontend/src/lib/api.ts."""
    return f"Rp{value:,}".replace(",", ".") if value else "Gratis"
