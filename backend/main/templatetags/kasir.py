from django import template

register = template.Library()


@register.filter
def pickup_code(code):
    """H7K49 → "H7K · 49", the way the buyer's ticket shows it."""
    return f"{code[:3]} · {code[3:]}"


@register.filter
def buyer_short(user):
    """Rani Ayu → "Rani A.": enough for the cashier to call the buyer, no more.

    Sign-up keeps the whole name in first_name, so split the full name.
    """
    words = (user.get_full_name() or user.username).split()
    return f"{words[0]} {words[-1][0]}." if len(words) > 1 else words[0]


@register.filter
def rupiah(value):
    """10000 → "Rp 10.000"; donations show "Gratis", like rupiah() in frontend/src/lib/api.ts."""
    return f"Rp {value:,}".replace(",", ".") if value else "Gratis"
